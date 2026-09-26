\# Buayar \- Unified Payment Gateway Integration

\> Multi-provider payment gateway adapter supporting Indonesian & global providers.

Buayar unifies multiple payment gateways into a consistent, robust API interface. It simplifies transaction handling, checkout sessions, webhooks, and status inquiries across 20 payment providers.

\#\# Core Documentation & Guides (Native llms.txt)

These providers host native machine-readable \`llms.txt\` documentation indexes:

\- \[Midtrans Documentation Index\](https://docs.midtrans.com/llms.txt): Midtrans Payment API, Core API, Snap checkout, and webhook handling.  
\- \[Xendit Documentation Index\](https://docs.xendit.co/llms.txt): Xendit payment requests, invoices, e-wallets, and webhook verification.  
\- \[Stripe Documentation Index\](https://docs.stripe.com/llms.txt): Stripe Checkout Sessions, Payment Intents, Webhooks, and API reference.  
\- \[PayPal Documentation Index\](https://developer.paypal.com/llms.txt): PayPal REST APIs, Orders v2, and webhook events.  
\- \[Adyen Documentation Index\](https://docs.adyen.com/llms.txt): Adyen Checkout API, Payment Methods, and Management APIs.  
\- \[Razorpay Documentation Index\](https://razorpay.com/docs/llms.txt): Razorpay Orders, Payments API, and Webhooks index.  
\- \[DOKU Jokul Documentation Index\](https://developers.doku.com/llms.txt): DOKU Jokul Checkout, Direct API, and notification signatures.  
\- \[Faspay Documentation Index\](https://docs.faspay.co.id/llms.txt): Faspay Debit, Credit Card, and SNAP Virtual Account APIs.  
\- \[Finpay Documentation Index\](https://docs.finpay.id/llms.txt): Finpay Core API, hosted payment, and bill payment services.  
\- \[Checkout.com Documentation Index\](https://checkoutdocs.readme.io/llms.txt): Checkout.com REST API reference and payment integration.  
\- \[PayU India Documentation Index\](https://docs.payu.in/llms.txt): PayU India Payment Gateway, Checkout, and Webhook guides.

\#\# Indonesian Payment Gateways (Developer Documentation)

Documentation for Indonesian payment aggregators and gateways:

\- \[Duitku API Documentation\](https://docs.duitku.com/api/id/): Duitku v2 payment API, transaction requests, and callback verification.  
\- \[Duitku POP Integration\](https://docs.duitku.com/pop/): Duitku Payment On Page (POP) modal and popup checkout.  
\- \[iPaymu API Documentation\](https://docs.ipaymu.com/): iPaymu Direct Payment, Redirect Payment, VA, and webhook verification.  
\- \[iPaymu Postman Collection\](https://documenter.getpostman.com/view/40296808/2sB3WtseBT): Official iPaymu API v2 endpoints and payload schemas.  
\- \[PrismaLink Documentation\](https://docs.prismalink.co.id/): PrismaLink payment gateway, Virtual Account, and CMS plugins.  
\- \[PrismaLink Payment Integration\](https://docs.prismalink.co.id/payment/): API and payment page integration specifications.  
\- \[NICEPAY Indonesia Documentation\](https://docs.nicepay.co.id/): NICEPAY all-in-one payment gateway guides and sandbox setup.  
\- \[NICEPAY API Reference\](https://docs.nicepay.co.id/en/nicepay-api): NICEPAY REST API specifications for Virtual Accounts, Cards, and E-Wallets.  
\- \[NICEPAY SNAP BI\](https://docs.nicepay.co.id/nicepay-api-snap): Bank Indonesia SNAP open banking API implementation.  
\- \[OY\! Indonesia Documentation\](https://docs.oyindonesia.com/id/): OY\! Bisnis product documentation, disbursement, and aggregator APIs.  
\- \[SumoPod Pay SDK\](https://github.com/Fadhila36/sumopod-pay): Unofficial SDK and integration specs for SumoPod Payment Gateway.

\#\# Global Payment Gateways (Developer Documentation)

Documentation for global payment gateways and platforms:

\- \[Square Developer Documentation\](https://developer.squareup.com/docs): Square Payments API, Checkout API, and Web Payments SDK.  
\- \[Square REST API Guide\](https://developer.squareup.com/docs/build-basics/general-considerations/using-rest-api): Square API conventions, headers, and idempotency keys.  
\- \[PayU Europe Developer Guide\](https://developers.payu.com/europe/): PayU GPO Europe integration guide, authorization, and order flows.  
\- \[PayU Europe REST API\](https://developers.payu.com/europe/api/): PayU REST API v2.1 endpoints and specifications.  
\- \[Braintree Developer Documentation\](https://developer.paypal.com/braintree/docs/): PayPal Braintree SDKs, server integration, and transaction processing.  
\- \[Braintree API Reference\](https://developer.paypal.com/braintree/docs/reference/overview): Braintree GraphQL and REST API reference.  
\- \[2Checkout (Verifone) Documentation\](https://docs.2checkout.com/): 2Checkout global payments, hosted checkout, and subscription billing.  
\- \[2Checkout REST API Reference\](https://docs.2checkout.com/api-reference): Verifone 2Checkout REST API endpoints and webhooks.

\#\# Provider Configuration & Credential Mapping

Quick credential mapping reference for Buayar environment variables:

\- Midtrans (\`midtrans\`): \`BUAYAR\_API\_KEY\` (Server Key), \`BUAYAR\_CLIENT\_KEY\` (Client Key)  
\- Duitku (\`duitku\`): \`BUAYAR\_API\_KEY\` (API Key), \`BUAYAR\_MERCHANT\_CODE\` (Merchant Code)  
\- iPaymu (\`ipaymu\`): \`BUAYAR\_API\_KEY\` (API Key), \`BUAYAR\_MERCHANT\_CODE\` (Virtual Account VA)  
\- Xendit (\`xendit\`): \`BUAYAR\_API\_KEY\` (Secret Key), \`BUAYAR\_WEBHOOK\_SECRET\` (Webhook Token)  
\- DOKU Jokul (\`doku\`): \`BUAYAR\_API\_KEY\` (Secret Key), \`BUAYAR\_MERCHANT\_CODE\` / \`BUAYAR\_CLIENT\_KEY\` (Client ID)  
\- PrismaLink (\`prismalink\`): \`BUAYAR\_API\_KEY\` (Secret Key), \`BUAYAR\_MERCHANT\_CODE\` (Merchant ID)  
\- Faspay (\`faspay\`): \`BUAYAR\_API\_KEY\` (Password), \`BUAYAR\_MERCHANT\_CODE\` (Merchant ID), \`BUAYAR\_CLIENT\_KEY\` (User ID)  
\- Finpay (\`finpay\`): \`BUAYAR\_API\_KEY\` (Merchant Key), \`BUAYAR\_MERCHANT\_CODE\` (Merchant ID)  
\- Nicepay (\`nicepay\`): \`BUAYAR\_API\_KEY\` (Server Key), \`BUAYAR\_MERCHANT\_CODE\` (I-MID)  
\- OY\! Bisnis (\`oy\`): \`BUAYAR\_API\_KEY\` (API Key), \`BUAYAR\_MERCHANT\_CODE\` / \`BUAYAR\_CLIENT\_KEY\` (Username)  
\- Stripe (\`stripe\`): \`BUAYAR\_API\_KEY\` (Secret Key), \`BUAYAR\_CLIENT\_KEY\` (Publishable Key / Webhook Secret)  
\- PayPal (\`paypal\`): \`BUAYAR\_API\_KEY\` (Client Secret), \`BUAYAR\_MERCHANT\_CODE\` / \`BUAYAR\_CLIENT\_KEY\` (Client ID)  
\- Adyen (\`adyen\`): \`BUAYAR\_API\_KEY\` (API Key), \`BUAYAR\_MERCHANT\_CODE\` (Merchant Account), \`BUAYAR\_CLIENT\_KEY\` (Client Key / HMAC Key)  
\- Checkout.com (\`checkoutcom\`): \`BUAYAR\_API\_KEY\` (Secret Key), \`BUAYAR\_CLIENT\_KEY\` (Public Key / Webhook Secret)  
\- Razorpay (\`razorpay\`): \`BUAYAR\_API\_KEY\` (Key Secret), \`BUAYAR\_MERCHANT\_CODE\` / \`BUAYAR\_CLIENT\_KEY\` (Key ID)  
\- Square (\`square\`): \`BUAYAR\_API\_KEY\` (Access Token), \`BUAYAR\_MERCHANT\_CODE\` (App ID), \`BUAYAR\_PROJECT\_ID\` (Location ID)  
\- PayU (\`payu\`): \`BUAYAR\_API\_KEY\` (MD5 Key), \`BUAYAR\_MERCHANT\_CODE\` / \`BUAYAR\_CLIENT\_KEY\` (POS ID)  
\- Braintree (\`braintree\`): \`BUAYAR\_API\_KEY\` (Private Key), \`BUAYAR\_MERCHANT\_CODE\` (Merchant ID), \`BUAYAR\_CLIENT\_KEY\` (Public Key)  
\- 2Checkout (\`twocheckout\`): \`BUAYAR\_API\_KEY\` (Secret Key), \`BUAYAR\_MERCHANT\_CODE\` (Merchant Code), \`BUAYAR\_WEBHOOK\_SECRET\` (Secret Word)  
\- SumoPod (\`sumopod\`): \`BUAYAR\_API\_KEY\` (X-Api-Key), \`BUAYAR\_WEBHOOK\_SECRET\` (Webhook Secret / Token)  
