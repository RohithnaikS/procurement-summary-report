sap.ui.define([
    "sap/ui/core/UIComponent"
], (UIComponent) => {
    "use strict";

    return UIComponent.extend("psr.psr.Component", {
        metadata: {
            manifest: "json",
            interfaces: [
                "sap.ui.core.IAsyncContentCreation"
            ]
        },

        init() {
            // call the base component's init function
            UIComponent.prototype.init.apply(this, arguments);

            // set the device model
            this.setModel(new sap.ui.model.json.JSONModel({
                isPhone: sap.ui.Device.system.phone,
                isTouch: sap.ui.Device.support.touch,
                isNoTouch: !sap.ui.Device.support.touch,
                isDesktop: sap.ui.Device.system.desktop,
                isTablet: sap.ui.Device.system.tablet,
                isNotPhone: !sap.ui.Device.system.phone,
                isNotDesktop: !sap.ui.Device.system.desktop
            }), "device");

            const oPaymentTermsModel = new sap.ui.model.json.JSONModel();
            oPaymentTermsModel.setSizeLimit(1000);
            oPaymentTermsModel.loadData("model/paymentterms.json");
            this.setModel(oPaymentTermsModel, "paymentTerms");
            
            




            // enable routing
            this.getRouter().initialize();
        }

    });
});