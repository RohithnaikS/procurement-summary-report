sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/model/Sorter",
    "sap/ui/core/format/DateFormat",
    "psr/psr/model/formatter"
], function (Controller, JSONModel, Filter, FilterOperator, Sorter, DateFormat, formatter) {
    "use strict";

    var TABLE_TITLES = {
        all: "All Requests",
        my: "My Requests",
        approval: "Pending for My Approval"
    };

    return Controller.extend("psr.psr.controller.Dashboard", {

        onInit: function () {

            var oDashboardModel = new JSONModel({
                requesterEmail: "",
                requesterName: "",
                requesterId: "",
                isAdmin: false,
                requests: [],
                visibleRequests: [],
                counts: { all: 0, my: 0, approval: 0 },
                selectedTile: "",
                tableTitle: TABLE_TITLES.my,
                searchQuery: "",
                statusFilter: "",
                sortDescending: true
            });

            this.getView().setModel(oDashboardModel, "dashboard");

            this._oDateFormat = DateFormat.getDateTimeInstance({ style: "medium" });

            // Requests can only be split into the tiles once the user ID and
            // roles are known, so wait for both before the first load.
            this._oUserReady = Promise.all([this._loadLoggedInUser(), this._loadRoles()]);
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
                return this._loadLoggedInUserFromShell(oDashboardModel);
            }

            var oOperation = oODataModel.bindContext("/getCurrentUser(...)");

            return oOperation
                .execute()
                .then(function () {

                    var oResult = oOperation.getBoundContext().getObject();

                    if (oResult && oResult.name) {

                        oDashboardModel.setProperty("/requesterName", formatter.displayName(oResult.name, oResult.email));
                        oDashboardModel.setProperty("/requesterId", oResult.userID || "");
                        oDashboardModel.setProperty(
                            "/requesterEmail",
                            oResult.email || oResult.mail || ""
                        );
                        return undefined;
                    }
                    return this._loadLoggedInUserFromShell(oDashboardModel);
                }.bind(this))
                .catch(function () {
                    return this._loadLoggedInUserFromShell(oDashboardModel);
                }.bind(this));
        },


        _loadLoggedInUserFromShell: function (oDashboardModel) {

            try {

                if (sap.ushell && sap.ushell.Container) {

                    return sap.ushell.Container
                        .getServiceAsync("UserInfo")
                        .then(function (oUserInfo) {

                            var sName =
                                oUserInfo.getFullName() ||
                                oUserInfo.getId() ||
                                "";

                            oDashboardModel.setProperty("/requesterName", formatter.displayName(sName, oUserInfo.getEmail()));
                            oDashboardModel.setProperty("/requesterId", oUserInfo.getId() || "");
                            oDashboardModel.setProperty("/requesterEmail", oUserInfo.getEmail() || "");
                        })
                        .catch(function () {
                            oDashboardModel.setProperty("/requesterEmail", "");
                        });

                }

                oDashboardModel.setProperty("/requesterEmail", "");

            } catch (oError) {
                oDashboardModel.setProperty("/requesterEmail", "");
            }
            return Promise.resolve();
        },


        // Admins get the "All Requests" tile; everyone else only sees their
        // own requests and the ones waiting for their approval.
        _loadRoles: function () {

            var oDashboardModel = this.getView().getModel("dashboard");
            var oODataModel = this.getOwnerComponent().getModel();

            if (!oODataModel) {
                return Promise.resolve();
            }

            var oOperation = oODataModel.bindContext("/getMyRoles(...)");

            return oOperation
                .execute()
                .then(function () {
                    var vResult = oOperation.getBoundContext().getObject();
                    var aRoles = Array.isArray(vResult) ? vResult : (vResult && vResult.value) || [];
                    oDashboardModel.setProperty("/isAdmin", aRoles.indexOf("Admin") !== -1);
                })
                .catch(function (oError) {
                    console.error("Failed to load user roles:", oError);
                });
        },


        // Loads every request the user may see (the service already limits
        // non-admins to their own and assigned requests) and splits them
        // into the tiles.
        _loadRequests: function () {

            var oDashboardModel = this.getView().getModel("dashboard");

            var oODataModel = this.getOwnerComponent().getModel();

            if (!oODataModel) {
                console.error("OData model not available.");
                return;
            }

            var oListBinding = oODataModel.bindList("/ProcurementRequests", null, null, null, {
                $select: "ID,requestNumber,procurementName,requesterName,approvalStatus,createdAt,createdBy,canCurrentUserDecide"
            });

            Promise.all([this._oUserReady, oListBinding.requestContexts(0, Infinity)])
                .then(function (aResults) {

                    var aRequests = aResults[1].map(function (oContext) {
                        var oRequest = Object.assign({}, oContext.getObject());
                        oRequest.statusText = this._statusText(oRequest.approvalStatus);
                        oRequest.requesterName = formatter.displayName(oRequest.requesterName, oRequest.createdBy);
                        return oRequest;
                    }.bind(this));

                    oDashboardModel.setProperty("/requests", aRequests);
                    this._updateTiles();
                }.bind(this))
                .catch(function (oError) {
                    console.error("Failed to load procurement requests:", oError);
                });
        },


        _statusText: function (sStatus) {
            var sUpper = String(sStatus || "Pending").toUpperCase();
            if (sUpper === "APPROVED") {
                return "Approved";
            }
            if (sUpper === "REJECTED") {
                return "Rejected";
            }
            return "Pending";
        },


        _requestsForTile: function (sTile) {

            var oDashboardModel = this.getView().getModel("dashboard");
            var aRequests = oDashboardModel.getProperty("/requests") || [];
            var sUserId = oDashboardModel.getProperty("/requesterId");

            if (sTile === "all") {
                return aRequests.slice();
            }
            if (sTile === "approval") {
                return aRequests.filter(function (oRequest) {
                    return oRequest.canCurrentUserDecide === true;
                });
            }
            return aRequests.filter(function (oRequest) {
                return !!sUserId && oRequest.createdBy === sUserId;
            });
        },


        _updateTiles: function () {

            var oDashboardModel = this.getView().getModel("dashboard");
            var bAdmin = oDashboardModel.getProperty("/isAdmin");

            oDashboardModel.setProperty("/counts", {
                all: String(bAdmin ? this._requestsForTile("all").length : 0),
                my: String(this._requestsForTile("my").length),
                approval: String(this._requestsForTile("approval").length)
            });

            var sTile = oDashboardModel.getProperty("/selectedTile");
            if (!sTile || (sTile === "all" && !bAdmin)) {
                sTile = bAdmin ? "all" : "my";
            }
            this._selectTile(sTile);
        },


        _selectTile: function (sTile) {

            var oDashboardModel = this.getView().getModel("dashboard");

            oDashboardModel.setProperty("/selectedTile", sTile);
            oDashboardModel.setProperty("/tableTitle", TABLE_TITLES[sTile]);
            oDashboardModel.setProperty("/visibleRequests", this._requestsForTile(sTile));
            this._applyTableFilters();
        },


        onTilePress: function (oEvent) {
            this._selectTile(oEvent.getSource().data("tile"));
        },


        // Search (title / requester / request ID), status filter and the
        // Created At sort are applied together on the table binding.
        _applyTableFilters: function () {

            var oDashboardModel = this.getView().getModel("dashboard");
            var oBinding = this.byId("idPSRTable").getBinding("items");

            if (!oBinding) {
                return;
            }

            var sQuery = (oDashboardModel.getProperty("/searchQuery") || "").trim();
            var sStatus = oDashboardModel.getProperty("/statusFilter");
            var aFilters = [];

            if (sQuery) {
                aFilters.push(new Filter({
                    filters: [
                        new Filter({ path: "procurementName", operator: FilterOperator.Contains, value1: sQuery, caseSensitive: false }),
                        new Filter({ path: "requesterName", operator: FilterOperator.Contains, value1: sQuery, caseSensitive: false }),
                        new Filter({ path: "requestNumber", operator: FilterOperator.Contains, value1: sQuery, caseSensitive: false })
                    ],
                    and: false
                }));
            }

            if (sStatus) {
                aFilters.push(new Filter("statusText", FilterOperator.EQ, sStatus));
            }

            oBinding.filter(aFilters.length ? new Filter({ filters: aFilters, and: true }) : []);
            oBinding.sort(new Sorter("createdAt", oDashboardModel.getProperty("/sortDescending")));
        },


        onTableSearch: function (oEvent) {

            var sQuery = oEvent.getParameter("newValue");
            if (sQuery === undefined) {
                sQuery = oEvent.getParameter("query");
            }

            this.getView().getModel("dashboard").setProperty("/searchQuery", sQuery || "");
            this._applyTableFilters();
        },


        onStatusFilterChange: function () {
            this._applyTableFilters();
        },


        onToggleSort: function () {

            var oDashboardModel = this.getView().getModel("dashboard");
            oDashboardModel.setProperty("/sortDescending", !oDashboardModel.getProperty("/sortDescending"));
            this._applyTableFilters();
        },


        formatDateTime: function (vDate) {
            return vDate ? this._oDateFormat.format(new Date(vDate)) : "";
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
        }

    });
});
