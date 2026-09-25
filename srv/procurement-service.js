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

  const isAssignedApprover = (approver, user) => {
    const userEmail = user && user.attr && user.attr.email
    return approver && user && (
      approver.approverID === user.id ||
      approver.approverEmail === user.id ||
      (userEmail && approver.approverEmail === userEmail)
    )
  }

  this.on('startApprovalProcess', async (req) => {

    const {
        requestID
    } = req.data;

    if (!requestID) {
        return req.error(
            400,
            'Request ID is required.'
        );
    }

    console.log(
        'Starting BPA approval process for:',
        requestID
    );

    // 1. Read request
    // 2. Read approvers
    // 3. Build BPA context
    // 4. Obtain OAuth token
    // 5. Start BPA process

});

  // BPA can use this optional webhook to start its requester-notification
  // automation. Keeping the endpoint in an environment variable means no
  // BPA credentials or tenant URL are committed to the project.
  const notifyBpa = async (environmentVariable, payload) => {
    const url = process.env[environmentVariable]
    if (!url) return

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload)
      })
      if (!response.ok) {
        console.error('BPA decision webhook failed:', response.status, await response.text())
      }
    } catch (error) {
      // The decision is already saved. A notification outage must not let an
      // approver accidentally submit the same decision twice.
      console.error(`Could not notify BPA through ${environmentVariable}:`, error)
    }
  }

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

    if (!requestID || !['APPROVED', 'REJECTED'].includes(decision)) {
      return req.reject(400, 'A request ID and an APPROVED or REJECTED decision are required.')
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
      UPDATE(Approvers).set({ status: decision, actionedAt: now }).where({ ID: nextApprover.ID })
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

    const updatedRequest = await tx.run(SELECT.one.from(ProcurementRequests).where({ ID: requestID }))
    if (!hasMoreApprovers) {
      const requester = await tx.run(SELECT.one.from(Requesters).where({ userID: request.createdBy }))
      await notifyBpa('BPA_DECISION_WEBHOOK_URL', {
        event: 'PSR_APPROVAL_DECIDED',
        requestID: updatedRequest.ID,
        requestNumber: updatedRequest.requestNumber,
        procurementName: updatedRequest.procurementName,
        decision: requestStatus,
        requesterEmail: requester && requester.email,
        decidedBy: updatedRequest.approvalDecisionBy,
        decidedAt: now
      })
    }
    return updatedRequest
  })

  // Optional inbound BPA trigger: configure this endpoint to start the
  // approval-mail automation immediately after a report is submitted.
  this.after('CREATE', ProcurementRequests, async (createdRequest, req) => {
    const request = createdRequest || {}
    const requester = await cds.tx(req).run(
      SELECT.one.from(Requesters).where({ userID: req.user.id })
    )
    const approvers = (req.data.approvers || []).map((approver) => ({
      level: approver.loaLevel,
      name: approver.approverName,
      email: approver.approverEmail
    }))
    await notifyBpa('BPA_SUBMISSION_WEBHOOK_URL', {
      event: 'PSR_SUBMITTED_FOR_APPROVAL',
      requestID: request.ID || req.data.ID,
      requestNumber: request.requestNumber || req.data.requestNumber,
      procurementName: request.procurementName || req.data.procurementName,
      requesterEmail: requester && requester.email,
      approvers
    })
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

  this.before(['CREATE', 'UPDATE'], Attachments, async (req) => {
    console.log('Before CREATE/UPDATE Attachments', req.data)
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
