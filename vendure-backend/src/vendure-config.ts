import {
    dummyPaymentHandler,
    DefaultJobQueuePlugin,
    DefaultSchedulerPlugin,
    DefaultSearchPlugin,
    VendureConfig,
} from '@vendure/core';
import {
    defaultEmailHandlers,
    EmailPlugin,
    EmailPluginDevModeOptions,
    EmailPluginOptions,
} from '@vendure/email-plugin';
import { AssetServerPlugin } from '@vendure/asset-server-plugin';
import { AdminUiPlugin } from '@vendure/admin-ui-plugin';
import { StripePlugin } from '@vendure/payments-plugin/package/stripe';
import 'dotenv/config';
import path from 'path';

const isDev = process.env.APP_ENV === 'dev';

const sgMail = require('@sendgrid/mail');

if (process.env.SENDGRID_API_KEY?.startsWith('SG.')) {
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

class SendgridEmailSender {
    async send(email: any) {
        await sgMail.send({
            to: email.recipient,
            from: email.from,
            subject: email.subject,
            html: email.body,
        });
    }
}

const emailPluginOptions =
    isDev || !process.env.SENDGRID_API_KEY
        ? {
              devMode: true,
              outputPath: path.join(__dirname, '../static/email/test-emails'),
              route: 'mailbox',
          }
        : {
              emailSender: new SendgridEmailSender(),
              transport: {
                  type: 'sendgrid',
                  apiKey: process.env.SENDGRID_API_KEY,
              },
          };

export const config: VendureConfig = {
    apiOptions: {
        port: +(process.env.PORT || 3000),
        adminApiPath: 'admin-api',
        shopApiPath: 'shop-api',

        ...(isDev
            ? {
                  adminApiPlayground: {
                      settings: { 'request.credentials': 'include' },
                  },
                  adminApiDebug: true,
                  shopApiPlayground: {
                      settings: { 'request.credentials': 'include' },
                  },
                  shopApiDebug: true,
              }
            : {}),
    },

    authOptions: {
        tokenMethod: ['bearer', 'cookie'],
        superadminCredentials: {
            identifier: process.env.SUPERADMIN_USERNAME,
            password: process.env.SUPERADMIN_PASSWORD,
        },
        cookieOptions: {
            secret: process.env.COOKIE_SECRET,
        },
    },

    dbConnectionOptions: {
        type: 'postgres',
        synchronize: true,
        migrations: [path.join(__dirname, './migrations/*.+(js|ts)')],
        logging: false,

        database: process.env.DB_NAME,
        schema: process.env.DB_SCHEMA,
        host: process.env.DB_HOST,
        port: +process.env.DB_PORT,
        username: process.env.DB_USERNAME,
        password: process.env.DB_PASSWORD,

        ssl: true,
        extra: {
            ssl: {
                rejectUnauthorized: false,
            },
        },
    },

    paymentOptions: {
        paymentMethodHandlers: [dummyPaymentHandler],
    },

    customFields: {},

    plugins: [
        AssetServerPlugin.init({
            route: 'assets',
            assetUploadDir:
                process.env.ASSET_VOLUME_PATH ||
                path.join(__dirname, '../static/assets'),
            assetUrlPrefix: isDev
                ? undefined
                : `https://${process.env.PUBLIC_DOMAIN}/assets/`,
        }),

        StripePlugin.init({
            storeCustomersInStripe: true,
            paymentIntentCreateParams: (injector, ctx, order) => {
                return {
                    description: `Order #${order.code} for ${order.customer?.emailAddress}`,
                };
            },
        }),

        DefaultSchedulerPlugin.init(),
        DefaultJobQueuePlugin.init({
            useDatabaseForBuffer: true,
        }),
        DefaultSearchPlugin.init({
            bufferUpdates: false,
            indexStockStatus: true,
        }),

        EmailPlugin.init({
            ...emailPluginOptions,
            handlers: defaultEmailHandlers,
            templatePath: path.join(
                __dirname,
                '../static/email/templates'
            ),
            globalTemplateVars: {
                fromAddress:
                    process.env.EMAIL_FROM_ADDRESS ||
                    '"example" <noreply@example.com>',
                verifyEmailAddressUrl:
                    `${process.env.STOREFRONT_URL}/verify`,
                passwordResetUrl:
                    `${process.env.STOREFRONT_URL}/password-reset`,
                changeEmailAddressUrl:
                    `${process.env.STOREFRONT_URL}/verify-email-address-change`,
            },
        } as EmailPluginOptions | EmailPluginDevModeOptions),

       AdminUiPlugin.init({
    route: 'admin',
    port: 3002,
    adminUiConfig: {
        apiHost: 'auto',
        apiPort: 'auto',
    },
}),
    ],
};
