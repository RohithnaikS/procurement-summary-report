const cds = require('@sap/cds')


module.exports = class ProcurementService extends cds.ApplicationService { async init() {
  const common = await cds.connect.to('CommonMasterDataService');

  const {
    ProcurementRequests,
    Attachments,
    Approvers,
    VendorRiskAssessments,
    Requesters,
    PurchasingGroups,
    PurchasingOrganizations,
    Incoterms
  } = cds.entities('ProcurementService')

  const { TaxCodes } = cds.entities('ProcurementService')

  // Same e-mail resolution as Flowmate: IAS/XSUAA put the e-mail into
  // different attributes depending on the trust configuration.
  const userEmails = (user) => {
    const attr = (user && user.attr) || {}
    return [attr.email, attr.mail, attr.user_name, user && user.id]
      .filter(Boolean)
      .map((value) => String(value).toLowerCase())
  }

  const isAssignedApprover = (approver, user) => {
    if (!approver || !user) return false
    const approverEmail = String(approver.approverEmail || '').toLowerCase()
    return approver.approverID === user.id ||
      (!!approverEmail && userEmails(user).includes(approverEmail))
  }

  // ---------------------------------------------------------------------
  // BPA approval e-mails. The app drives the approval order: the PSR
  // process is started once per approver, for level 1 on submit and for
  // the next level after each approval (see decideApproval).
  // ---------------------------------------------------------------------
  const BPA_TECHNICAL_DESTINATION = process.env.BPA_DESTINATION || 'bpa_workflow_technical'
  const BPA_WORKFLOW_PATH = '/workflow/rest/v1/workflow-instances'
  const BPA_PSR_DEFINITION_ID = process.env.BPA_PSR_DEFINITION_ID

  // Link in the e-mail. A query parameter (not #/main/<ID>) survives the
  // approuter -> IAS login redirect; Component.js turns it into the route.
  const appLink = (req, requestID) => {
    let base = process.env.PSR_APP_URL
    if (!base) {
      const httpReq = (req.http && req.http.req) || {}
      const headers = httpReq.headers || {}
      const host = headers['x-forwarded-host'] || headers.host
      const protocol = String(headers['x-forwarded-proto'] || httpReq.protocol || 'https').split(',')[0]
      base = host ? `${protocol}://${host}/index.html` : ''
    }
    return base ? `${base}?requestId=${requestID}` : ''
  }

  // Input of the PSR BPA API trigger ("context"). Names and types must match
  // the trigger's inputs exactly (lower case; approveremail is a list;
  // level/total are strings).
  const buildBpaContext = (req, request, approver, approvers, requester, remarks) => ({
    approveremail: [approver.approverEmail],
    approvername: approver.approverName || approver.approverEmail,
    applink: appLink(req, request.ID),
    requestnumber: request.requestNumber || '',
    procurementname: request.procurementName || '',
    procurementvalue: request.procurementValueInclTax != null
      ? `${request.procurementValueInclTax} ${request.currency_code || ''}`.trim()
      : '',
    requestername: (requester && requester.name) || request.createdBy || '',
    requesteremail: (requester && requester.email) || '',
    approvallevel: String(approver.loaLevel),
    totallevels: String(approvers.length),
    remarks: remarks || ''
  })

  console.log(buildBpaContext.toString());

  // Destination + extra headers for the BPA call. On BTP the destination
  // service resolves bpa_workflow_technical including its OAuth token. For
  // local runs the destination comes from the `destinations` env variable
  // (default-env.json); the Cloud SDK cannot run the client-credentials flow
  // for those, so the token is fetched here.
  const bpaTarget = async () => {
    let localDestinations = []
    try { localDestinations = JSON.parse(process.env.destinations || '[]') } catch (e) { /* not set */ }
    const local = localDestinations.find((d) => d.name === BPA_TECHNICAL_DESTINATION)
    if (!local || local.authentication !== 'OAuth2ClientCredentials') {
      return { destination: { destinationName: BPA_TECHNICAL_DESTINATION }, headers: {} }
    }
    const tokenResponse = await fetch(local.tokenServiceUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        authorization: 'Basic ' + Buffer.from(`${local.clientId}:${local.clientSecret}`).toString('base64')
      },
      body: 'grant_type=client_credentials'
    })
    if (!tokenResponse.ok) {
      throw new Error(`BPA token request failed: ${tokenResponse.status} ${await tokenResponse.text()}`)
    }
    const { access_token: accessToken } = await tokenResponse.json()
    return { destination: { url: local.url }, headers: { authorization: `Bearer ${accessToken}` } }
  }

  // Starts the BPA process for one approver. `remarks` is shown in the
  // e-mail: the requester's remarks for level 1, otherwise what the previous
  // approver wrote. Never throws: the request / decision is already saved,
  // so a BPA outage is recorded on the approver row (notificationError)
  // instead of failing the user's action.
  const notifyApprover = async (req, request, approver, approvers, remarks) => {
    const tx = cds.tx(req)
    const now = new Date().toISOString()
    try {
      if (!BPA_PSR_DEFINITION_ID) {
        throw new Error('BPA_PSR_DEFINITION_ID is not configured.')
      }
      const requester = await tx.run(SELECT.one.from(Requesters).where({ userID: request.createdBy }))
      const { executeHttpRequest } = require('@sap-cloud-sdk/http-client')
      const { destination, headers } = await bpaTarget()
      const response = await executeHttpRequest(
        destination,
        {
          method: 'POST',
          url: BPA_WORKFLOW_PATH,
          headers,
          data: {
            definitionId: BPA_PSR_DEFINITION_ID,
            context: buildBpaContext(req, request, approver, approvers, requester, remarks)
          }
        },
        { fetchCsrfToken: false }
      )
      await tx.run(UPDATE(Approvers).set({
        notifiedAt: now,
        bpaInstanceID: response.data && response.data.id,
        notificationError: null
      }).where({ ID: approver.ID }))
      console.log(`BPA approval e-mail started for ${approver.approverEmail} (level ${approver.loaLevel}) on ${request.requestNumber}`)
    } catch (error) {
      const detail = (error.response && `${error.response.status} ${JSON.stringify(error.response.data)}`) ||
        [error.message, error.cause && error.cause.message].filter(Boolean).join(' - ')
      console.error(`BPA approval e-mail for ${approver.approverEmail} on ${request.requestNumber} failed:`, detail)
      await tx.run(UPDATE(Approvers).set({
        notificationError: String(detail).slice(0, 500)
      }).where({ ID: approver.ID }))
    }
  }

  // Called by the UI right after the request and its attachments are saved:
  // e-mails the first approver.
  this.on('startApprovalProcess', async (req) => {
    const { requestID } = req.data
    if (!requestID) return req.reject(400, 'Request ID is required.')

    const tx = cds.tx(req)
    const request = await tx.run(SELECT.one.from(ProcurementRequests).where({ ID: requestID }))
    if (!request) return req.reject(404, 'Procurement request was not found.')
    if (request.createdBy !== req.user.id) {
      return req.reject(403, 'Only the requester can start the approval process.')
    }
    if ((request.approvalStatus || 'Pending') !== 'Pending') {
      return req.reject(409, `This request has already been ${String(request.approvalStatus).toLowerCase()}.`)
    }

    const approvers = await tx.run(
      SELECT.from(Approvers).where({ request_ID: requestID }).orderBy('loaLevel asc')
    )
    const firstApprover = approvers.find((approver) => approver.status === 'Pending')
    if (!firstApprover) return req.reject(400, 'The request has no pending approver.')
    // Idempotent: a retry must not e-mail the approver twice.
    if (firstApprover.notifiedAt) return 'ALREADY_NOTIFIED'

    await notifyApprover(req, request, firstApprover, approvers, request.requesterRemarks)
    const updated = await tx.run(SELECT.one.from(Approvers).columns('notifiedAt').where({ ID: firstApprover.ID }))
    return updated && updated.notifiedAt ? 'NOTIFIED' : 'NOTIFICATION_FAILED'
  })

  // ---------------------------------------------------------------------
  // Makes sure a Requesters row exists (and is up to date) for whoever is
  // currently logged in, keyed on their user ID - the same ID that CAP's
  // `managed` aspect automatically writes into `createdBy` on insert.
  // The `requester` association on ProcurementRequests is resolved by
  // matching `requester.userID = createdBy`, so as long as this row
  // exists, the association - and the flattened `requesterName` /
  // `requesterEmail` fields exposed on the service - will resolve.
  // ---------------------------------------------------------------------
async function ensureRequester(req) {

    const oUser = req.user

    if (!oUser || oUser.id === 'anonymous') {
        return null
    }

    const sUserID = oUser.id

    const sName =
        oUser.attr &&
        (oUser.attr.given_name || oUser.attr.family_name)
            ? [
                oUser.attr.given_name,
                oUser.attr.family_name
            ]
                .filter(Boolean)
                .join(' ')
            : sUserID

    const sEmail =
        (oUser.attr && oUser.attr.email) || sUserID

    // Use the transaction associated with the current request
    const tx = cds.tx(req)

    const oExisting = await tx.run(
        SELECT.one
            .from(Requesters)
            .where({ userID: sUserID })
    )

    if (oExisting) {

        if (
            oExisting.name !== sName ||
            oExisting.email !== sEmail
        ) {

            await tx.run(
                UPDATE(Requesters)
                    .set({
                        name: sName,
                        email: sEmail
                    })
                    .where({ userID: sUserID })
            )

            oExisting.name = sName
            oExisting.email = sEmail
        }

        return oExisting
    }

    await tx.run(
        INSERT.into(Requesters).entries({
            userID: sUserID,
            name: sName,
            email: sEmail
        })
    )

    return await tx.run(
        SELECT.one
            .from(Requesters)
            .where({ userID: sUserID })
    )
}



  // Lets the UI fetch/create the current user's requester record before a
  // ProcurementRequests row even exists (e.g. to show it in the header
  // while the form is being filled in).
  this.on('getCurrentUser', async (req) => {
    return await ensureRequester(req)
  })



this.on('getVendors', async (req) => {
  const vendors = await common.run(
    SELECT.from(common.entities.Vendors).where({ isActive: true })
  )

  return vendors.map(vendor => ({
    ID: vendor.ID,
    vendorCode: vendor.vendorCode,
    vendorName: vendor.vendorName,
    vendorEmail: vendor.vendorEmail || ''
  }))
});


  // Readable business reference: PSR- + zero-padded 6-digit serial
  // (PSR-000001, PSR-000002, ...). Legacy PSR-<uuid> numbers are longer and
  // therefore excluded from the sequence.
  const nextRequestNumber = async (req) => {
    const last = await cds.tx(req).run(
      SELECT.one.from(ProcurementRequests).columns('requestNumber')
        .where`requestNumber like 'PSR-______' and length(requestNumber) = 10`
        .orderBy('requestNumber desc')
    )
    const next = (last ? parseInt(last.requestNumber.slice(4), 10) || 0 : 0) + 1
    return `PSR-${String(next).padStart(6, '0')}`
  }

  this.before(['CREATE', 'UPDATE'], ProcurementRequests, async (req) => {

    // requester is derived from createdBy and must never be set directly
    // by a client - strip it defensively even though the unmanaged
    // association already makes it non-writable via OData.
    delete req.data.requester
    delete req.data.requester_ID
    delete req.data.requesterName
    delete req.data.requesterEmail

    // Guarantee the Requesters row backing this user exists so the
    // association resolves as soon as the request is saved.
    await ensureRequester(req)

    if (req.event === 'CREATE') {
      // CAP normally generates cuid IDs later in the request lifecycle. Set
      // it here so later handlers (e.g. the BPA webhook) can rely on it.
      req.data.ID = req.data.ID || cds.utils.uuid()
      req.data.requestNumber = req.data.requestNumber || await nextRequestNumber(req)
      req.data.approvalStatus = req.data.approvalStatus || 'Pending'
    }

    console.log('Before CREATE/UPDATE ProcurementRequests', req.data)
  })

  this.on('decideApproval', async (req) => {
    const decision = String(req.data.decision || '').toUpperCase()
    const requestID = req.data.requestID
    const remarks = String(req.data.remarks || '').trim()

    if (!requestID || !['APPROVED', 'REJECTED'].includes(decision)) {
      return req.reject(400, 'A request ID and an APPROVED or REJECTED decision are required.')
    }
    if (decision === 'REJECTED' && !remarks) {
      return req.reject(400, 'Remarks are required to reject a request.')
    }

    const tx = cds.tx(req)
    const request = await tx.run(SELECT.one.from(ProcurementRequests).where({ ID: requestID }))
    if (!request) return req.reject(404, 'Procurement request was not found.')
    const currentStatus = request.approvalStatus || 'Pending'
    if (currentStatus !== 'Pending') {
      return req.reject(409, `This request has already been ${currentStatus.toLowerCase()}.`)
    }

    const approvers = await tx.run(
      SELECT.from(Approvers).where({ request_ID: requestID }).orderBy('loaLevel asc')
    )
    const nextApprover = approvers.find((approver) => approver.status === 'Pending')
    if (!nextApprover || !isAssignedApprover(nextApprover, req.user)) {
      return req.reject(403, 'Only the next assigned approver can make this decision.')
    }

    const now = new Date().toISOString()
    await tx.run(
      UPDATE(Approvers).set({ status: decision, actionedAt: now, comments: remarks || null }).where({ ID: nextApprover.ID })
    )

    const hasMoreApprovers = decision === 'APPROVED' && approvers.some(
      (approver) => approver.ID !== nextApprover.ID && approver.status === 'Pending'
    )
    const requestStatus = hasMoreApprovers ? 'Pending' : decision

    await tx.run(
      UPDATE(ProcurementRequests).set({
        approvalStatus: requestStatus,
        approvalDecisionAt: hasMoreApprovers ? null : now,
        approvalDecisionBy: hasMoreApprovers ? null : (req.user.attr && req.user.attr.email) || req.user.id
      }).where({ ID: requestID })
    )

    // Approved with more levels left: it is now the next approver's turn.
    if (hasMoreApprovers) {
      const followingApprover = approvers.find(
        (approver) => approver.ID !== nextApprover.ID && approver.status === 'Pending'
      )
      if (followingApprover && !followingApprover.notifiedAt) {
        // The next approver's e-mail shows what this approver wrote.
        await notifyApprover(req, request, followingApprover, approvers, remarks)
      }
    }

    return tx.run(SELECT.one.from(ProcurementRequests).where({ ID: requestID }))
  })


  this.on('getApprovers', async (req) => {
    const users = await common.run(
      SELECT.from(common.entities.Users).where({ isActive: true })
    )

    return users.map(user => ({
      id: user.ID,
      name: user.displayName,
      email: user.email,
      department: user.department,
      userPrincipalName: user.userPrincipalName
    }))
});





  this.after('READ', ProcurementRequests, async (procurementRequests, req) => {
    const requests = Array.isArray(procurementRequests) ? procurementRequests : [procurementRequests]
    const requestIDs = requests.filter(Boolean).map((request) => request.ID)
    if (requestIDs.length) {
      const approvers = await cds.tx(req).run(
        SELECT.from(Approvers).where({ request_ID: { in: requestIDs }, status: 'Pending' }).orderBy('loaLevel asc')
      )
      requests.filter(Boolean).forEach((request) => {
        const next = approvers.find((approver) => approver.request_ID === request.ID)
        request.canCurrentUserDecide = (request.approvalStatus || 'Pending') === 'Pending' && isAssignedApprover(next, req.user)
      })
    }
    console.log('After READ ProcurementRequests', procurementRequests)
  })

  // Attachments are added by the requester while the request is pending;
  // approvers (and everyone else) may only read/download them. Metadata
  // created through the request's deep insert does not pass this handler.
  this.before(['CREATE', 'UPDATE', 'DELETE'], Attachments, async (req) => {
    const tx = cds.tx(req)
    let requestID = req.data.request_ID
    const attachmentID = req.data.ID || (req.params && req.params[0] && (req.params[0].ID || req.params[0]))
    if (!requestID && attachmentID) {
      const attachment = await tx.run(SELECT.one.from(Attachments).columns('request_ID').where({ ID: attachmentID }))
      requestID = attachment && attachment.request_ID
    }
    const request = requestID && await tx.run(
      SELECT.one.from(ProcurementRequests).columns('createdBy', 'approvalStatus').where({ ID: requestID })
    )
    if (!request) return req.reject(404, 'The procurement request for this attachment was not found.')
    if (request.createdBy !== req.user.id) {
      return req.reject(403, 'Only the requester can change attachments.')
    }
    if ((request.approvalStatus || 'Pending') !== 'Pending') {
      return req.reject(403, 'Attachments cannot be changed after the approval decision.')
    }
  })
  this.after('READ', Attachments, async (attachments, req) => {
    console.log('After READ Attachments', attachments)
  })

  this.before(['CREATE', 'UPDATE'], Approvers, async (req) => {
    console.log('Before CREATE/UPDATE Approvers', req.data)
  })
  this.after('READ', Approvers, async (approvers, req) => {
    console.log('After READ Approvers', approvers)
  })

  this.before(['CREATE', 'UPDATE'], VendorRiskAssessments, async (req) => {
    console.log('Before CREATE/UPDATE VendorRiskAssessments', req.data)
  })
  this.after('READ', VendorRiskAssessments, async (vendorRiskAssessments, req) => {
    console.log('After READ VendorRiskAssessments', vendorRiskAssessments)
  })

  this.before(['CREATE', 'UPDATE'], Requesters, async (req) => {
    console.log('Before CREATE/UPDATE Requesters', req.data)
  })
  this.after('READ', Requesters, async (requesters, req) => {
    console.log('After READ Requesters', requesters)
  })

  // These entities are projections on CommonMasterDataService; CAP resolves
  // the projection (entity name + column aliases) when delegating req.query.
  this.on('READ', [TaxCodes, PurchasingGroups, PurchasingOrganizations, Incoterms], req => common.run(req.query))


  return super.init()
}}
