sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator"
], function (Controller, JSONModel, Filter, FilterOperator) {
    "use strict";

    return Controller.extend("psr.psr.controller.Dashboard", {

        onInit: function () {

            var oDashboardModel = new JSONModel({
                requesterEmail: "",
                requesterName: "",
                requesterId: "",
                requests: []
            });

            this.getView().setModel(oDashboardModel, "dashboard");

            this._loadLoggedInUser();
            this._loadRequests();
            this.getOwnerComponent().getRouter().getRoute("dashboard")
                .attachPatternMatched(this._loadRequests, this);
        },


        // Same pattern as main.controller.js: call the backend's
        // getCurrentUser() action first, fall back to the FLP shell user
        // if the OData call isn't reachable.
        _loadLoggedInUser: function () {

            var oDashboardModel = this.getView().getModel("dashboard");

            var oODataModel = this.getOwnerComponent().getModel();

            if (!oODataModel) {
                this._loadLoggedInUserFromShell(oDashboardModel);
                return;
            }

            var oOperation = oODataModel.bindContext("/getCurrentUser(...)");

            oOperation
                .execute()
                .then(function () {

                    var oResult = oOperation.getBoundContext().getObject();

                    if (oResult && oResult.name) {

                        oDashboardModel.setProperty("/requesterName", oResult.name);
                        oDashboardModel.setProperty("/requesterId", oResult.userID || "");

                        // Adjust the property name below to whatever your
                        // getCurrentUser() action actually returns for email
                        // (e.g. oResult.email / oResult.mail / oResult.userEmail).
                        oDashboardModel.setProperty(
                            "/requesterEmail",
                            oResult.email || oResult.mail || ""
                        );

                    } else {
                        this._loadLoggedInUserFromShell(oDashboardModel);
                    }
                }.bind(this))
                .catch(function () {
                    this._loadLoggedInUserFromShell(oDashboardModel);
                }.bind(this));
        },


        _loadLoggedInUserFromShell: function (oDashboardModel) {

            try {

                if (sap.ushell && sap.ushell.Container) {

                    sap.ushell.Container
                        .getServiceAsync("UserInfo")
                        .then(function (oUserInfo) {

                            var sName =
                                oUserInfo.getFullName() ||
                                oUserInfo.getId() ||
                                "";

                            oDashboardModel.setProperty("/requesterName", sName);
                            oDashboardModel.setProperty("/requesterId", oUserInfo.getId() || "");
                            oDashboardModel.setProperty("/requesterEmail", oUserInfo.getEmail() || "");
                        })
                        .catch(function () {
                            oDashboardModel.setProperty("/requesterEmail", "");
                        });

                } else {
                    oDashboardModel.setProperty("/requesterEmail", "");
                }

            } catch (oError) {
                oDashboardModel.setProperty("/requesterEmail", "");
            }
        },


        // Loads the list of submitted PSR requests for the table.
        // NOTE: rename "/ProcurementRequests" below to match your actual
        // CDS entity set (the one main.controller.js writes new PSRs to).
        _loadRequests: function () {

            var oDashboardModel = this.getView().getModel("dashboard");

            var oODataModel = this.getOwnerComponent().getModel();

            if (!oODataModel) {
                console.error("OData model not available.");
                return;
            }

            var oListBinding = oODataModel.bindList("/ProcurementRequests", null, null, null, {
                $expand: "vendorRiskAssessment"
            });

            oListBinding
                .requestContexts()
                .then(function (aContexts) {

                    var aRequests = aContexts.map(function (oContext) {
                        return oContext.getObject();
                    });

                    oDashboardModel.setProperty("/requests", aRequests);
                })
                .catch(function (oError) {
                    console.error("Failed to load procurement requests:", oError);
                });
        },


        // "Fill Procurement Summary Report" -> opens the main form.
        // Route name matches manifest.json's "Routemain" route (pattern "main").
        onFillProcurementSummaryReport: function () {

            this.getOwnerComponent()
                .getRouter()
                .navTo("Routemain");
        },


            // Row press -> opens the selected request in read-only mode.
        onRequestPress: function (oEvent) {

            var oContext = oEvent
                .getSource()
                .getBindingContext("dashboard");

            var sId = oContext.getProperty("ID");

            this.getOwnerComponent()
                .getRouter()
                .navTo("Routemain", { ID: sId });
        },


        onTableSearch: function (oEvent) {

            var sQuery = oEvent.getParameter("newValue");

            var oTable = this.byId("idPSRTable");

            var oBinding = oTable.getBinding("items");

            if (!sQuery) {
                oBinding.filter([]);
                return;
            }

            var aFilters = [
                new Filter("procurementName", FilterOperator.Contains, sQuery),
                new Filter("requesterName", FilterOperator.Contains, sQuery),
                new Filter("requestNumber", FilterOperator.Contains, sQuery)
            ];

            oBinding.filter(new Filter({
                filters: aFilters,
                and: false
            }));
        }

    });
});
