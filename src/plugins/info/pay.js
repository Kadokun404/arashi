import { config } from "#root/config.js"
/**
 * @import {PluginCtx, PluginType} from "#types/types.js"
 */

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    const { sock, m, jid, command } = ctx

    const paymentMap = {
        dana: {
            key: "6282156985894",
            name: "DANA",
            institution_name: "DANA",
            account_type: "ewallet"
        },
        gopay: {
            key: "6282156985894",
            name: "GoPay",
            institution_name: "GoPay",
            account_type: "ewallet"
        }
    }

    const payment = paymentMap[command]
    if (!payment) return await m.arashirep('command tidak dikenali')

    await sock.relayMessage(jid, {
        interactiveMessage: {
            header: {
                title: "Z-Hiruira Pay"
            },
            body: {
                text: "Screenshot bukti transfer agar dapat admin proses."
            },
            footer: {
                text: "QRIS : ALL PAYMENT"
            },
            nativeFlowMessage: {
                buttons: [
                    {
                        name: "payment_key_info",
                        buttonParamsJson: JSON.stringify({
                            currency: "IDR",
                            total_amount: { value: 500000, offset: 100 },
                            reference_id: "ZHIRUIRA" + Date.now(),
                            type: "digital-goods",
                            order: {
                                status: "pending",
                                subtotal: { value: 500000, offset: 100 },
                                order_type: "BILL",
                                items: [
                                    {
                                        name: "Z-Hiruira Pay",
                                        amount: { value: 500000, offset: 100 },
                                        quantity: 1,
                                        sale_amount: { value: 500000, offset: 100 }
                                    }
                                ]
                            },
                            payment_settings: [
                                {
                                    type: "payment_key",
                                    payment_key: {
                                        type: "IDPAYMENTACCOUNT",
                                        full_name_on_account: "Z-Hiruira",
                                        ...payment
                                    }
                                }
                            ],
                            share_payment_status: false,
                            referral: "chat_attachment"
                        })
                    }
                ]
            }
        }
    }, {
        additionalNodes: [
            {
                tag: "biz",
                attrs: { native_flow_name: "payment_key_info" }
            }
        ]
    })
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "payment gateway",
    commands: ["dana", "gopay"],
    categories: ["info"],
    description: "info pembayaran Z-Hiruira Pay, !dana atau !gopay"
}

plugin.meta = {
    filename: "pay.js",
    author: config.devName,
    note: "",
    version: "2",
    path: "info"
}

export default plugin