sap.ui.define([], function () {
    "use strict";

    return {

        // A person's display name. getCurrentUser() falls back to the user ID
        // when the IdP sends no first/last name (e.g. local mocked users), so
        // an e-mail-like value is turned into "First Last" from its local part.
        displayName: function (sName, sEmail) {

            var sValue = String(sName || "").trim();

            if (sValue && sValue.indexOf("@") === -1) {
                return sValue;
            }

            var sLocalPart = (sValue || String(sEmail || "")).split("@")[0];

            return sLocalPart
                .split(/[._-]+/)
                .filter(Boolean)
                .map(function (sPart) {
                    return sPart.charAt(0).toUpperCase() + sPart.slice(1).toLowerCase();
                })
                .join(" ");
        }
    };
});
