sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "sap/m/SelectDialog",
    "sap/m/StandardListItem",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator"
], function (
    Controller,
    JSONModel,
    MessageBox,
    MessageToast,
    SelectDialog,
    StandardListItem,
    Filter,
    FilterOperator
) {
    "use strict";

    return Controller.extend("psr.psr.controller.main", {

        onInit: function () {

            var oFormData = {

                name: "",
                objective: "",
                type: "",
                recommendation: "",
                currency: "",
                valueWithoutTax: "",
                valueWithTax: "",
                ticApproval: "",
                technicalEvaluation: "",
                commercialEvaluation: "",
                numberOfVendors: "",

                // requester is populated automatically from the logged-in user
                requesterName: "",
                requesterId: "",

                paymentTerms: "",
                paymentTermsDescription: "",
                paymentMilestone: "",
                paymentMode: "",

                // Price validity is now a date range instead of free text
                priceValidityFrom: "",
                priceValidityTo: "",

                performanceBond: "",
                warranty: "",
                termsOfDelivery: "",
                liquidatedDamages: "",
                applicableTaxes: "",
                expenseType: "",

                businessProcessFlag: "",
                purchasingOrganization: "",
                purchasingGroup: "",
                incoterms: "",
                incoLocation: "",
                otherconditions: "",
                requesterRemarks: "",

                dialogDataAccess: "",
                hasPIIAccess: "",
                hasPaymentAccess: "",
                hasInfrastructureAccess: "",
                hostedOnSupplierPremises: "",

                // New field: overall vendor risk rating
                riskRating: ""
            };

            var oFormModel = new JSONModel(oFormData);

            this.getView().setModel(oFormModel, "form");

            this._loadLoggedInUser();


            var oVendorModel = new JSONModel({
                vendors: []
            });

            this.getView().setModel(oVendorModel, "vendors");

            var oVendorListModel = new JSONModel({
    vendors: []
});

this.getView().setModel(oVendorListModel, "vendorList");

this._loadVendors();


            var oAttachmentModel = new JSONModel({
                attachments: []
            });

            this.getView().setModel(oAttachmentModel, "attachments");


            var oApproverModel = new JSONModel({
                approvers: []
            });

            this.getView().setModel(oApproverModel, "approvers");
            var oApproverListModel = new JSONModel({
            users: []
            });
this.getView().setModel(oApproverListModel, "approverList");

            this._loadApprovers();


            var oOptionsModel = new JSONModel({

                dataAccess: [
                    { key: "RESTRICTED", text: "Restricted" },
                    { key: "CONFIDENTIAL", text: "Confidential" },
                    { key: "INTERNAL", text: "Internal" },
                    { key: "PUBLIC", text: "Public" },
                    { key: "NO_DATA", text: "No data access" }
                ],

                yesNo: [
                    { key: "YES", text: "Yes" },
                    { key: "NO", text: "No" }
                ],

                riskRating: [
                    { key: "HIGH", text: "High" },
                    { key: "MEDIUM", text: "Medium" },
                    { key: "LOW", text: "Low" },
                    { key: "OUT_OF_SCOPE", text: "Out of Scope" }
                ]
            });

            this.getView().setModel(oOptionsModel, "options");

            this.getOwnerComponent().getRouter().getRoute("Routemain")
                .attachPatternMatched(this._onMainRouteMatched, this);
        },


        _onMainRouteMatched: function (oEvent) {

            var sId = oEvent.getParameter("arguments").ID;

            if (!sId) {
                this._resetFormForNewRequest();
                this._setFormReadOnly(false);
                return;
            }

            this._loadRequestForReview(sId);
        },


        _resetFormForNewRequest: function () {

            this.getView().getModel("form").setData({
                name: "",
                objective: "",
                type: "",
                recommendation: "",
                currency: "",
                valueWithoutTax: "",
                valueWithTax: "",
                ticApproval: "",
                technicalEvaluation: "",
                commercialEvaluation: "",
                numberOfVendors: "",
                requesterName: "",
                requesterId: "",
                paymentTerms: "",
                paymentTermsDescription: "",
                paymentMilestone: "",
                paymentMode: "",
                priceValidityFrom: "",
                priceValidityTo: "",
                performanceBond: "",
                warranty: "",
                termsOfDelivery: "",
                liquidatedDamages: "",
                applicableTaxes: "",
                expenseType: "",
                businessProcessFlag: "",
                purchasingOrganization: "",
                purchasingGroup: "",
                purchasingGroup_ID: "",
                incoterms: "",
                incoLocation: "",
                otherconditions: "",
                requesterRemarks: "",
                dialogDataAccess: "",
                hasPIIAccess: "",
                hasPaymentAccess: "",
                hasInfrastructureAccess: "",
                hostedOnSupplierPremises: "",
                riskRating: ""
            });

            this.getView().getModel("vendors").setProperty("/vendors", []);
            this.getView().getModel("attachments").setProperty("/attachments", []);
            this.getView().getModel("approvers").setProperty("/approvers", []);

            [
                "idTypeRadioButtonGroup",
                "idTICApprovalRadioButtonGroup",
                "idNumberOfVendorsRadioButtonGroup",
                "idBusinessProcessFlagsRadioButtonGroup",
                "idDialogDataAccessRadioButtonGroup",
                "idPIIAccessRadioButtonGroup",
                "idPaymentAccessRadioButtonGroup",
                "idInfrastructureAccessRadioButtonGroup",
                "idHostedOnSupplierPremisesRadioButtonGroup",
                "idRiskRatingRadioButtonGroup"
            ].forEach(function (sControlId) {
                this.byId(sControlId).setSelectedIndex(-1);
            }.bind(this));

            this._loadLoggedInUser();
        },


        _loadRequestForReview: function (sId) {

            var oODataModel = this.getOwnerComponent().getModel();

            if (!oODataModel) {
                MessageBox.error("The procurement service is not available.");
                return;
            }

            this.getView().setBusy(true);

            oODataModel
                .bindContext("/ProcurementRequests(" + sId + ")", null, {
                    $expand: "vendorRiskAssessment"
                })
                .requestObject()
                .then(function (oRequest) {

                    var oRisk = oRequest.vendorRiskAssessment || {};
                    var aVendorNames = (oRequest.selectedVendorsName || "").split(", ");
                    var aVendorCodes = (oRequest.selectedVendorsCode || "").split(", ");
                    var iVendorCount = Math.max(aVendorNames.length, aVendorCodes.length);
                    var aVendors = [];

                    for (var i = 0; i < iVendorCount; i += 1) {
                        if (aVendorNames[i] || aVendorCodes[i]) {
                            aVendors.push({
                                vendorName: aVendorNames[i] || "",
                                vendorCode: aVendorCodes[i] || "",
                                showAdd: false,
                                showRemove: false
                            });
                        }
                    }

                    this.getView().getModel("form").setData({
                        name: oRequest.procurementName || "",
                        objective: oRequest.procurementObjective || "",
                        type: oRequest.procurementType_code || "",
                        recommendation: oRequest.recommendation || "",
                        currency: oRequest.currency_code || "",
                        valueWithoutTax: oRequest.procurementValueExclTax || "",
                        valueWithTax: oRequest.procurementValueInclTax || "",
                        ticApproval: oRequest.ticApproval_code || "",
                        technicalEvaluation: oRequest.technicalEvaluationSummary || "",
                        commercialEvaluation: oRequest.commercialEvaluationSummary || "",
                        numberOfVendors: oRequest.numberOfVendorsSelected_code || "",
                        requesterName: oRequest.requesterName || "",
                        requesterId: oRequest.createdBy || "",
                        paymentTerms: oRequest.paymentTerms_code || "",
                        paymentTermsDescription: oRequest.paymentTermDescription || "",
                        paymentMilestone: oRequest.paymentMilestone || "",
                        paymentMode: oRequest.paymentMode_code || "",
                        priceValidityFrom: oRequest.priceValidityFrom || "",
                        priceValidityTo: oRequest.priceValidityTo || "",
                        performanceBond: oRequest.performanceBond || "",
                        warranty: oRequest.warranty || "",
                        termsOfDelivery: oRequest.termsOfDelivery || "",
                        liquidatedDamages: oRequest.liquidatedDamages || "",
                        applicableTaxes: oRequest.applicableTaxes_code || "",
                        expenseType: oRequest.expenseType_code || "",
                        businessProcessFlag: oRequest.businessProcessFlag_code || "",
                        purchasingOrganization: oRequest.purchasingOrganization_code || "",
                        purchasingGroup: oRequest.purchasingGroup_code || "",
                        purchasingGroup_ID: oRequest.purchasingGroup_code || "",
                        incoterms: oRequest.incoTerms_code || "",
                        incoLocation: oRequest.incoLocation || "",
                        otherconditions: oRequest.otherConditions || "",
                        requesterRemarks: oRequest.requesterRemarks || "",
                        dialogDataAccess: oRisk.dataAccessType_code || "",
                        hasPIIAccess: oRisk.hasPIIAccess_code || "",
                        hasPaymentAccess: oRisk.hasPaymentCardAccess_code || "",
                        hasInfrastructureAccess: oRisk.hasInfraAccess_code || "",
                        hostedOnSupplierPremises: oRisk.isDialogDataHostedOnSupplier_code || "",
                        riskRating: oRisk.riskRating || ""
                    });

                    this.getView().getModel("vendors").setProperty("/vendors", aVendors);
                    this._setReviewSelections(oRequest, oRisk);
                    this._setFormReadOnly(true);
                }.bind(this))
                .catch(function (oError) {
                    MessageBox.error("The selected procurement request could not be loaded.");
                    console.error("Failed to load procurement request:", oError);
                })
                .finally(function () {
                    this.getView().setBusy(false);
                }.bind(this));
        },


        _setReviewSelections: function (oRequest, oRisk) {

            var mSelections = {
                idTypeRadioButtonGroup: ["direct", "non-direct"].indexOf(oRequest.procurementType_code),
                idTICApprovalRadioButtonGroup: ["yes", "no"].indexOf(oRequest.ticApproval_code),
                idNumberOfVendorsRadioButtonGroup: ["single", "multiple"].indexOf(oRequest.numberOfVendorsSelected_code),
                idBusinessProcessFlagsRadioButtonGroup: ["FOC_PO", "DBS", "MARKETING"].indexOf(oRequest.businessProcessFlag_code),
                idDialogDataAccessRadioButtonGroup: ["RESTRICTED", "CONFIDENTIAL", "INTERNAL", "PUBLIC", "NO_DATA"].indexOf(oRisk.dataAccessType_code),
                idPIIAccessRadioButtonGroup: ["YES", "NO"].indexOf(oRisk.hasPIIAccess_code),
                idPaymentAccessRadioButtonGroup: ["YES", "NO"].indexOf(oRisk.hasPaymentCardAccess_code),
                idInfrastructureAccessRadioButtonGroup: ["YES", "NO"].indexOf(oRisk.hasInfraAccess_code),
                idHostedOnSupplierPremisesRadioButtonGroup: ["YES", "NO"].indexOf(oRisk.isDialogDataHostedOnSupplier_code),
                idRiskRatingRadioButtonGroup: ["HIGH", "MEDIUM", "LOW", "OUT_OF_SCOPE"].indexOf(oRisk.riskRating)
            };

            Object.keys(mSelections).forEach(function (sControlId) {
                this.byId(sControlId).setSelectedIndex(mSelections[sControlId]);
            }.bind(this));
        },


        _setFormReadOnly: function (bReadOnly) {

            this.getView().findAggregatedObjects(true, function (oControl) {
                return oControl.isA("sap.m.InputBase") ||
                    oControl.isA("sap.m.RadioButtonGroup") ||
                    oControl.isA("sap.m.Button");
            }).forEach(function (oControl) {
                if (oControl.isA("sap.m.InputBase")) {
                    oControl.setEditable(!bReadOnly);
                } else if (oControl.isA("sap.m.RadioButtonGroup")) {
                    oControl.setEnabled(!bReadOnly);
                } else if (oControl.getId() !== this.byId("idCancelButton").getId()) {
                    oControl.setEnabled(!bReadOnly);
                }
            }.bind(this));

            this.byId("idSaveSubmitForApprovalButton").setVisible(!bReadOnly);
            this.byId("idCancelButton").setText(bReadOnly ? "Back to Dashboard" : "Cancel");
        },


        // Calls the backend's unbound `getCurrentUser()` function (added in
        // service.cds), which looks up - or creates - the Requesters row for
        // whoever is logged in. This is what actually reflects the schema/
        // service changes; sap.ushell is kept only as a same-tab fallback if
        // the OData call fails (e.g. offline/dev mocking) so the header
        // doesn't sit empty.
        _loadLoggedInUser: function () {

            var oFormModel = this.getView().getModel("form");

            var oODataModel = this.getOwnerComponent().getModel();

            if (!oODataModel) {
                this._loadLoggedInUserFromShell(oFormModel);
                return;
            }

            var oOperation = oODataModel.bindContext("/getCurrentUser(...)");

            oOperation
                .execute()
                .then(function () {

                    var oResult = oOperation.getBoundContext().getObject();

                    if (oResult && oResult.name) {
                        oFormModel.setProperty("/requesterName", oResult.name);
                        oFormModel.setProperty("/requesterId", oResult.userID || "");
                    } else {
                        this._loadLoggedInUserFromShell(oFormModel);
                    }
                }.bind(this))
                .catch(function (oError) {
                    // e.g. anonymous/unauthenticated session, or the
                    // function import isn't reachable yet - fall back
                    // rather than leaving the header blank.
                    this._loadLoggedInUserFromShell(oFormModel);
                }.bind(this));
        },


        // Fallback: reads the user directly from the Fiori Launchpad shell,
        // used only if the backend call above didn't return a name.
        _loadLoggedInUserFromShell: function (oFormModel) {

            try {

                if (sap.ushell && sap.ushell.Container) {

                    sap.ushell.Container
                        .getServiceAsync("UserInfo")
                        .then(function (oUserInfo) {

                            var sName =
                                oUserInfo.getFullName() ||
                                oUserInfo.getId() ||
                                "";

                            oFormModel.setProperty("/requesterName", sName);
                            oFormModel.setProperty("/requesterId", oUserInfo.getId() || "");
                        })
                        .catch(function () {
                            oFormModel.setProperty("/requesterName", "");
                        });

                } else {
                    oFormModel.setProperty("/requesterName", "");
                }

            } catch (oError) {
                oFormModel.setProperty("/requesterName", "");
            }
        },


        onPaymentTermsChange: function (oEvent) {

            var sSelectedId = oEvent
                .getSource()
                .getSelectedKey();

            var aPaymentTerms = this
                .getOwnerComponent()
                .getModel("paymentTerms")
                .getData();

            var oSelectedTerm = aPaymentTerms.find(function (oTerm) {
                return oTerm.id === sSelectedId;
            });

            var oFormModel = this.getView().getModel("form");

            if (oSelectedTerm) {

                oFormModel.setProperty(
                    "/paymentTermsDescription",
                    oSelectedTerm.description
                );

            } else {

                oFormModel.setProperty(
                    "/paymentTermsDescription",
                    ""
                );
            }
        },


        // Procurement Type (radio button group: Direct / Non-Direct)
        onTypeSelect: function (oEvent) {

            var iSelectedIndex = oEvent.getParameter("selectedIndex");

            var oFormModel = this.getView().getModel("form");

            var sType = "";

            if (iSelectedIndex === 0) {
                sType = "direct";
            } else if (iSelectedIndex === 1) {
                sType = "non-direct";
            }

            oFormModel.setProperty("/type", sType);
        },


        // TIC Approval (radio button group: Yes / No)
        onTicApprovalSelect: function (oEvent) {

            var iSelectedIndex = oEvent.getParameter("selectedIndex");

            var oFormModel = this.getView().getModel("form");

            var sValue = "";

            if (iSelectedIndex === 0) {
                sValue = "yes";
            } else if (iSelectedIndex === 1) {
                sValue = "no";
            }

            oFormModel.setProperty("/ticApproval", sValue);
        },


        // Number of Vendors (radio button group: Single / Multiple)
        onNumberOfVendorsSelect: function (oEvent) {

            var iSelectedIndex = oEvent.getParameter("selectedIndex");

            var oFormModel = this.getView().getModel("form");

            var sValue = "";

            if (iSelectedIndex === 0) {
                sValue = "single";
            } else if (iSelectedIndex === 1) {
                sValue = "multiple";
            }

            oFormModel.setProperty("/numberOfVendors", sValue);

            // When "Single" is chosen, only one vendor row is allowed and
            // the "+" (add) button must disappear; trim any extra rows.
            if (sValue === "single") {

                var oVendorModel = this.getView().getModel("vendors");
                var aVendors = oVendorModel.getProperty("/vendors");

                if (aVendors.length > 1) {
                    aVendors.splice(1);
                    oVendorModel.setProperty("/vendors", aVendors);
                }
            }

            this.updateVendorButtons();
        },


        // Vendors (name + code): starts with a single row, and more can be
        // added with "+" unless "Number of Vendors" is set to "Single".
        onAddFirstVendor: function () {

            var oModel = this
                .getView()
                .getModel("vendors");

            var aVendors = oModel.getProperty("/vendors");

            if (aVendors.length === 0) {

                aVendors.push({
                    vendorName: "",
                    vendorCode: "",
                    showAdd: true,
                    showRemove: false
                });

                oModel.setProperty(
                    "/vendors",
                    aVendors
                );
            }

            this.updateVendorButtons();
        },


        onAddVendor: function () {

            var oFormModel = this.getView().getModel("form");

            // Safety net: the "+" button is hidden when numberOfVendors is
            // "single", but guard here too in case it's ever triggered.
            if (oFormModel.getProperty("/numberOfVendors") === "single") {
                return;
            }

            var oModel = this
                .getView()
                .getModel("vendors");

            var aVendors = oModel.getProperty("/vendors");

            aVendors.push({
                vendorName: "",
                vendorCode: "",
                showAdd: true,
                showRemove: true
            });

            oModel.setProperty(
                "/vendors",
                aVendors
            );

            this.updateVendorButtons();
        },


        updateVendorButtons: function () {

            var oModel = this
                .getView()
                .getModel("vendors");

            var aVendors = oModel.getProperty("/vendors");

            var oFormModel = this.getView().getModel("form");
            var bIsSingle = oFormModel.getProperty("/numberOfVendors") === "single";

            aVendors.forEach(function (oVendor, index) {

                // No "+" at all when only a single vendor is allowed.
                oVendor.showAdd =
                    !bIsSingle && index === aVendors.length - 1;

                oVendor.showRemove =
                    !bIsSingle && aVendors.length > 1;
            });

            oModel.setProperty(
                "/vendors",
                aVendors
            );
        },

        _loadVendors: function () {

    var oVendorListModel =
        this.getView().getModel("vendorList");

    var oODataModel =
        this.getOwnerComponent().getModel();

    if (!oODataModel) {
        console.error("OData model not available.");
        return;
    }

    var oOperation =
        oODataModel.bindContext("/getVendors(...)");

    oOperation.execute()
        .then(function () {

            var oResult =
                oOperation.getBoundContext().getObject();

            oVendorListModel.setProperty(
                "/vendors",
                oResult.value || oResult || []
            );

            console.log(
                "Vendors loaded:",
                oVendorListModel.getProperty("/vendors")
            );

        }.bind(this))
        .catch(function (oError) {

            console.error(
                "Failed to load vendors:",
                oError
            );

            MessageBox.error(
                "Unable to load vendors."
            );

        }.bind(this));
},


        onRemoveVendor: function (oEvent) {

            var oContext = oEvent
                .getSource()
                .getBindingContext("vendors");

            var iIndex = parseInt(
                oContext.getPath().split("/").pop(),
                10
            );

            var oModel = this
                .getView()
                .getModel("vendors");

            var aVendors =
                oModel.getProperty("/vendors");

            aVendors.splice(iIndex, 1);

            oModel.setProperty(
                "/vendors",
                aVendors
            );

            this.updateVendorButtons();
        },

        onVendorValueHelp: function (oEvent) {

    var oInput = oEvent.getSource();

    var oContext =
        oInput.getBindingContext("vendors");

    if (!oContext) {
        return;
    }

    this._oVendorInput = oInput;

    if (!this._oVendorDialog) {

        this._oVendorDialog = new sap.m.TableSelectDialog({

            title: "Select Vendor",
            contentWidth: "62rem",

            columns: [
                new sap.m.Column({
                    width: "22rem",
                    header: new sap.m.Label({ text: "Vendor Name" })
                }),
                new sap.m.Column({
                    width: "12rem",
                    header: new sap.m.Label({ text: "Vendor Code" })
                }),
                new sap.m.Column({
                    width: "22rem",
                    header: new sap.m.Label({ text: "Email" })
                })
            ],

            search: function (oSearchEvent) {

                var sValue =
                    oSearchEvent.getParameter("value");

                var oBinding =
                    oSearchEvent.getSource().getBinding("items");

                if (sValue) {

                    var aFilters = [
                        new sap.ui.model.Filter(
                            "vendorCode",
                            sap.ui.model.FilterOperator.Contains,
                            sValue
                        ),
                        new sap.ui.model.Filter(
                            "vendorName",
                            sap.ui.model.FilterOperator.Contains,
                            sValue
                        )
                    ];

                    oBinding.filter(
                        new sap.ui.model.Filter({
                            filters: aFilters,
                            and: false
                        })
                    );

                } else {
                    oBinding.filter([]);
                }
            },

            confirm: this.onVendorSelect.bind(this),

            cancel: function () {
                // Nothing required
            }

        });

        this.getView().addDependent(
            this._oVendorDialog
        );

        this._oVendorDialog.setModel(
            this.getView().getModel("vendorList"),
            "vendorList"
        );

        this._oVendorDialog.bindAggregation(
            "items",
            {
                path: "vendorList>/vendors",
                templateShareable: false,
                template: new sap.m.ColumnListItem({
                    cells: [
                        new sap.m.Text({ text: "{vendorList>vendorName}" }),
                        new sap.m.Text({ text: "{vendorList>vendorCode}" }),
                        new sap.m.Text({ text: "{vendorList>vendorEmail}" })
                    ]
                })
            }
        );
    }

    this._oVendorDialog.data(
        "vendorContext",
        oContext
    );

    this._oVendorDialog.open();
},

onVendorSelect: function (oEvent) {

    var oSelectedItem =
        oEvent.getParameter("selectedItem") ||
        (oEvent.getParameter("selectedItems") || [])[0];
    var oVendor;

    if (oSelectedItem) {
        oVendor = oSelectedItem
            .getBindingContext("vendorList")
            .getObject();
    } else {
        // TableSelectDialog provides selectedContexts on newer UI5 versions.
        var oSelectedContext = (oEvent.getParameter("selectedContexts") || [])[0];
        oVendor = oSelectedContext && oSelectedContext.getObject();
    }

    if (!oVendor) {
        return;
    }

    var oContext =
        this._oVendorDialog.data("vendorContext");

    if (!oContext) {
        return;
    }

    var oVendorModel =
        this.getView().getModel("vendors");

    var sPath =
        oContext.getPath();

    oVendorModel.setProperty(
        sPath + "/vendorName",
        oVendor.vendorName
    );

    oVendorModel.setProperty(
        sPath + "/vendorCode",
        oVendor.vendorCode
    );

    this._oVendorDialog.close();
},


        onBusinessProcessFlagSelect: function (oEvent) {

            var iSelectedIndex = oEvent.getParameter("selectedIndex");

            var oFormModel = this.getView().getModel("form");

            var sFlag = "";

            if (iSelectedIndex === 0) {

                sFlag = "FOC_PO";

            } else if (iSelectedIndex === 1) {

                sFlag = "DBS";

            } else if (iSelectedIndex === 2) {

                sFlag = "MARKETING";
            }

            oFormModel.setProperty(
                "/businessProcessFlag",
                sFlag
            );
        },


        // Q1: Dialog data access (radio button group, 5 options)
        onDialogDataAccessSelect: function (oEvent) {

            var iSelectedIndex = oEvent.getParameter("selectedIndex");

            var aKeys = ["RESTRICTED", "CONFIDENTIAL", "INTERNAL", "PUBLIC", "NO_DATA"];

            var oFormModel = this.getView().getModel("form");

            oFormModel.setProperty(
                "/dialogDataAccess",
                aKeys[iSelectedIndex] || ""
            );
        },


        // Q2: PII access (radio button group: Yes / No)
        onPIIAccessSelect: function (oEvent) {

            var iSelectedIndex = oEvent.getParameter("selectedIndex");

            var oFormModel = this.getView().getModel("form");

            oFormModel.setProperty(
                "/hasPIIAccess",
                iSelectedIndex === 0 ? "YES" : (iSelectedIndex === 1 ? "NO" : "")
            );
        },


        // Q3: Payment/card information access (radio button group: Yes / No)
        onPaymentAccessSelect: function (oEvent) {

            var iSelectedIndex = oEvent.getParameter("selectedIndex");

            var oFormModel = this.getView().getModel("form");

            oFormModel.setProperty(
                "/hasPaymentAccess",
                iSelectedIndex === 0 ? "YES" : (iSelectedIndex === 1 ? "NO" : "")
            );
        },


        // Q4: Infrastructure access (radio button group: Yes / No)
        onInfrastructureAccessSelect: function (oEvent) {

            var iSelectedIndex = oEvent.getParameter("selectedIndex");

            var oFormModel = this.getView().getModel("form");

            oFormModel.setProperty(
                "/hasInfrastructureAccess",
                iSelectedIndex === 0 ? "YES" : (iSelectedIndex === 1 ? "NO" : "")
            );
        },


        // Q5: Hosted on supplier premises (radio button group: Yes / No)
        onHostedOnSupplierPremisesSelect: function (oEvent) {

            var iSelectedIndex = oEvent.getParameter("selectedIndex");

            var oFormModel = this.getView().getModel("form");

            oFormModel.setProperty(
                "/hostedOnSupplierPremises",
                iSelectedIndex === 0 ? "YES" : (iSelectedIndex === 1 ? "NO" : "")
            );
        },


        // Risk Rating (radio button group: High / Medium / Low / Out of Scope)
        onRiskRatingSelect: function (oEvent) {

            var iSelectedIndex = oEvent.getParameter("selectedIndex");

            var aKeys = ["HIGH", "MEDIUM", "LOW", "OUT_OF_SCOPE"];

            var oFormModel = this.getView().getModel("form");

            oFormModel.setProperty(
                "/riskRating",
                aKeys[iSelectedIndex] || ""
            );
        },


        // Saves the procurement request. Approval workflow is intentionally
        // not started here yet; that can be added after the workflow exists.
        onSaveAndSubmit: function (oEvent) {

            var oButton = oEvent.getSource();
            var oODataModel = this.getOwnerComponent().getModel();

            if (!oODataModel) {
                MessageBox.error("The procurement service is not available. Please try again.");
                return;
            }

            var oFormData = this.getView().getModel("form").getData();
            var aVendors = this.getView().getModel("vendors").getProperty("/vendors") || [];

            if (!oFormData.name || !oFormData.objective) {
                MessageBox.warning("Enter the procurement name and objective before saving.");
                return;
            }

            var oPayload = this._removeEmptyValues({
                procurementName: oFormData.name,
                procurementObjective: oFormData.objective,
                procurementType_code: oFormData.type,
                recommendation: oFormData.recommendation,
                currency_code: oFormData.currency,
                procurementValueExclTax: oFormData.valueWithoutTax,
                procurementValueInclTax: oFormData.valueWithTax,
                ticApproval_code: oFormData.ticApproval,
                technicalEvaluationSummary: oFormData.technicalEvaluation,
                commercialEvaluationSummary: oFormData.commercialEvaluation,
                numberOfVendorsSelected_code: oFormData.numberOfVendors,
                selectedVendorsName: aVendors.map(function (oVendor) {
                    return oVendor.vendorName;
                }).filter(Boolean).join(", "),
                selectedVendorsCode: aVendors.map(function (oVendor) {
                    return oVendor.vendorCode;
                }).filter(Boolean).join(", "),
                paymentTerms_code: oFormData.paymentTerms,
                paymentTermDescription: oFormData.paymentTermsDescription,
                paymentMilestone: oFormData.paymentMilestone,
                paymentMode_code: oFormData.paymentMode,
                priceValidityFrom: oFormData.priceValidityFrom,
                priceValidityTo: oFormData.priceValidityTo,
                performanceBond: oFormData.performanceBond,
                warranty: oFormData.warranty,
                termsOfDelivery: oFormData.termsOfDelivery,
                liquidatedDamages: oFormData.liquidatedDamages,
                applicableTaxes_code: oFormData.applicableTaxes,
                expenseType_code: oFormData.expenseType,
                businessProcessFlag_code: oFormData.businessProcessFlag,
                purchasingOrganization_code: oFormData.purchasingOrganization,
                purchasingGroup_code: oFormData.purchasingGroup_ID,
                incoTerms_code: oFormData.incoterms,
                incoLocation: oFormData.incoLocation,
                otherConditions: oFormData.otherconditions,
                requesterRemarks: oFormData.requesterRemarks,
                vendorRiskAssessment: {
                    dataAccessType_code: oFormData.dialogDataAccess,
                    hasPIIAccess_code: oFormData.hasPIIAccess,
                    hasPaymentCardAccess_code: oFormData.hasPaymentAccess,
                    hasInfraAccess_code: oFormData.hasInfrastructureAccess,
                    isDialogDataHostedOnSupplier_code: oFormData.hostedOnSupplierPremises,
                    riskRating: oFormData.riskRating
                }
            });

            oButton.setEnabled(false);

            var oNewRequest = oODataModel
                .bindList("/ProcurementRequests")
                .create(oPayload);

            oNewRequest.created()
                .then(function () {
                    MessageToast.show("Procurement summary report saved.");
                    this.getOwnerComponent().getRouter().navTo("dashboard", {}, true);
                }.bind(this))
                .catch(function (oError) {
                    var sServerMessage =
                        oError.error && oError.error.message ||
                        oError.message ||
                        "Unknown server error";

                    MessageBox.error(
                        "The procurement summary report could not be saved. " + sServerMessage
                    );
                    console.error("Failed to save procurement request:", oError);
                })
                .finally(function () {
                    oButton.setEnabled(true);
                });
        },

        onCancel: function () {
            this.getOwnerComponent().getRouter().navTo("dashboard", {}, true);
        },


        // OData does not accept an empty string for Date or Decimal fields.
        // Optional fields are therefore omitted rather than sent as "".
        _removeEmptyValues: function (oValue) {

            if (Array.isArray(oValue)) {
                return oValue.map(this._removeEmptyValues.bind(this));
            }

            if (oValue && typeof oValue === "object") {
                var oResult = {};

                Object.keys(oValue).forEach(function (sProperty) {
                    var vValue = this._removeEmptyValues(oValue[sProperty]);

                    if (
                        vValue !== "" &&
                        vValue !== null &&
                        vValue !== undefined &&
                        !(typeof vValue === "object" && !Array.isArray(vValue) && Object.keys(vValue).length === 0)
                    ) {
                        oResult[sProperty] = vValue;
                    }
                }.bind(this));

                return oResult;
            }

            return typeof oValue === "string" ? oValue.trim() : oValue;
        },


        onAddFirstAttachment: function () {

            var oModel = this
                .getView()
                .getModel("attachments");

            var aAttachments = oModel.getProperty("/attachments");

            if (aAttachments.length === 0) {

                aAttachments.push({
                    slotNumber: 1,
                    file: null,
                    fileName: "",
                    showAdd: true,
                    showRemove: false
                });

                oModel.setProperty(
                    "/attachments",
                    aAttachments
                );
            }

            this.updateAttachmentButtons();
        },


        onAddAttachment: function () {

            var oModel = this
                .getView()
                .getModel("attachments");

            var aAttachments = oModel.getProperty("/attachments");

            aAttachments.push({
                slotNumber: aAttachments.length + 1,
                file: null,
                fileName: "",
                showAdd: true,
                showRemove: true
            });

            oModel.setProperty(
                "/attachments",
                aAttachments
            );

            this.updateAttachmentButtons();
        },


        updateAttachmentButtons: function () {

            var oModel = this
                .getView()
                .getModel("attachments");

            var aAttachments = oModel.getProperty("/attachments");

            aAttachments.forEach(function (oAttachment, index) {

                oAttachment.showAdd =
                    index === aAttachments.length - 1;

                oAttachment.showRemove =
                    aAttachments.length > 1;
            });

            oModel.setProperty(
                "/attachments",
                aAttachments
            );
        },


        onRemoveAttachment: function (oEvent) {

            var oContext = oEvent
                .getSource()
                .getBindingContext("attachments");

            var iIndex = parseInt(
                oContext.getPath().split("/").pop(),
                10
            );

            var oModel = this
                .getView()
                .getModel("attachments");

            var aAttachments =
                oModel.getProperty("/attachments");

            aAttachments.splice(iIndex, 1);

            aAttachments.forEach(function (oAttachment, index) {

                oAttachment.slotNumber = index + 1;
            });

            oModel.setProperty(
                "/attachments",
                aAttachments
            );

            this.updateAttachmentButtons();
        },


        onFileChange: function (oEvent) {

            var oFileUploader = oEvent.getSource();

            var aFiles = oEvent.getParameter("files");

            if (!aFiles || !aFiles.length) {
                return;
            }

            var oFile = aFiles[0];

            var oContext =
                oFileUploader.getBindingContext("attachments");

            if (!oContext) {
                return;
            }

            var oModel =
                this.getView().getModel("attachments");

            var sPath = oContext.getPath();

            oModel.setProperty(
                sPath + "/file",
                oFile
            );

            oModel.setProperty(
                sPath + "/fileName",
                oFile.name
            );
        },


        onAddFirstApprover: function () {

            var oModel = this
                .getView()
                .getModel("approvers");

            var aApprovers =
                oModel.getProperty("/approvers");

            if (aApprovers.length === 0) {

                aApprovers.push({
                    approverID: "",
                    approverName: "",
                    approverEmail: "",
                    showAdd: true,
                    showRemove: false
                });

                oModel.setProperty(
                    "/approvers",
                    aApprovers
                );
            }

            this.updateApproverButtons();
        },


        onAddApprover: function () {

            var oModel = this
                .getView()
                .getModel("approvers");

            var aApprovers =
                oModel.getProperty("/approvers");

            aApprovers.push({
                approverID: "",
                approverName: "",
                approverEmail: "",
                showAdd: true,
                showRemove: true
            });

            oModel.setProperty(
                "/approvers",
                aApprovers
            );

            this.updateApproverButtons();
        },


        onApproverSelect: function (oEvent) {

            var oComboBox = oEvent.getSource();

            var sSelectedKey =
                oComboBox.getSelectedKey();

            var oSelectedItem =
                oComboBox.getSelectedItem();

            if (!oSelectedItem) {
                return;
            }

            var oUser =
                oSelectedItem
                    .getBindingContext("approverList")
                    .getObject();

            var oContext =
                oComboBox.getBindingContext("approvers");

            if (!oContext) {
                return;
            }

            var oModel =
                this.getView().getModel("approvers");

            var sPath = oContext.getPath();

            oModel.setProperty(
                sPath + "/approverID",
                oUser.id
            );

            oModel.setProperty(
                sPath + "/approverName",
                oUser.name
            );

            oModel.setProperty(
                sPath + "/approverEmail",
                oUser.email
            );
        },


        updateApproverButtons: function () {

            var oModel = this
                .getView()
                .getModel("approvers");

            var aApprovers =
                oModel.getProperty("/approvers");

            aApprovers.forEach(function (oApprover, index) {

                oApprover.showAdd =
                    index === aApprovers.length - 1;

                oApprover.showRemove =
                    aApprovers.length > 1;
            });

            oModel.setProperty(
                "/approvers",
                aApprovers
            );
        },

_loadApprovers: function () {

    var oApproverListModel =
        this.getView().getModel("approverList");

    var oODataModel =
        this.getOwnerComponent().getModel();

    if (!oODataModel) {
        console.error("OData model not available.");
        return;
    }

    var oOperation =
        oODataModel.bindContext("/getApprovers(...)");

    oOperation.execute()
        .then(function () {

            var oResult =
                oOperation.getBoundContext().getObject();

            oApproverListModel.setProperty(
                "/users",
                oResult.value || oResult || []
            );

            console.log(
                "Approvers loaded:",
                oApproverListModel.getProperty("/users")
            );

        }.bind(this))
        .catch(function (oError) {

            console.error(
                "Failed to load approvers:",
                oError
            );

        });
},


        onRemoveApprover: function (oEvent) {

            var oContext = oEvent
                .getSource()
                .getBindingContext("approvers");

            var iIndex = parseInt(
                oContext.getPath().split("/").pop(),
                10
            );

            var oModel =
                this.getView().getModel("approvers");

            var aApprovers =
                oModel.getProperty("/approvers");

            aApprovers.splice(iIndex, 1);

            oModel.setProperty(
                "/approvers",
                aApprovers
            );

            this.updateApproverButtons();

            
        }

    });
});
