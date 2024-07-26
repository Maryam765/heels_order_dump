import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import Queue from "bull";
import Service from "../../service/index.js";
import { redisClient } from "../../db/redis/index.js";
import { sleep, paginationWithCallback } from "../../helper/index.js";
import Order from "../../models/Order.js"; // assuming this is the correct path

dotenv.config();
const app = express();
const QUEUE_NAME = "GET_ORDER_QUEUE";
const CONCURRENT = 150;
const JOB_FAIL_RETRIES = 3;

const options = {
  redis: redisClient,
  removeOnFailure: true,
  removeOnSuccess: true,
};

const queue = new Queue(QUEUE_NAME, {
  redis: {
    port: Number(process.env.REDIS_PORT),
    host: process.env.REDIS_HOST,
  },
});

const startOrderQueue = (order) => {
  return queue.add(order, {
    attempts: JOB_FAIL_RETRIES,
  });
};

// Helper function to get variants from a store
const getVariants = async (service) => {
  let variants = [];
  await paginationWithCallback(
    {
      service,
      path: "/products.json",
    },
    async (products) => {
      products.forEach((product) => {
        product.variants.forEach((variant) => {
          variants.push({
            product_title: product.title,
            variant_title: variant.title,
            variant_id: variant.id,
          });
        });
      });
    }
  );
  return variants;
};

const mapVariants = (sourceVariants, destinationVariants) => {
  const variantMap = new Map();
  sourceVariants.forEach((sourceVariant) => {
    const destinationVariant = destinationVariants.find(
      (destVariant) =>
        destVariant.product_title === sourceVariant.product_title &&
        destVariant.variant_title === sourceVariant.variant_title
    );
    if (destinationVariant) {
      variantMap.set(sourceVariant.variant_id, destinationVariant.variant_id);
    }
  });
  return variantMap;
};

app.get("/sync-orders", async (req, res) => {
  let lastProcessedOrderId = null;
  const sourceService = new Service({
    shop_name: "heelss.myshopify.com/",
    accessToken: process.env.ACCESS_TOKEN_OLD,
    // shop_name: "source-store.myshopify.com",
    // accessToken: process.env.ACCESS_TOKEN_SOURCE,
  });
  const destinationService = new Service({
    shop_name: "maryam-pro.myshopify.com/",
    accessToken: process.env.ACCESS_TOKEN_MARYAM,
    // shop_name: "destination-store.myshopify.com",
    // accessToken: process.env.ACCESS_TOKEN_DESTINATION,
  });

  try {
    const sourceVariants = await getVariants(sourceService);
    const destinationVariants = await getVariants(destinationService);
    const variantMap = mapVariants(sourceVariants, destinationVariants);

    await paginationWithCallback(
      {
        service: sourceService,
        path: "/orders.json",
      },
      async (orders) => {
        let errors = [];
        let success = [];
        const BATCH_SIZE = 3;
        for (let i = 0; i < orders.length; i += BATCH_SIZE) {
          const batchOrders = orders.slice(i, i + BATCH_SIZE);

          for (const order of batchOrders) {
            const newOrderObj = {
              line_items: order.line_items.map((item) => {
                const newVariantId = variantMap.get(item.variant_id);
                if (!newVariantId) {
                  throw new Error(
                    `Variant mapping not found for variant ID: ${item.variant_id}`
                  );
                }
                return {
                  variant_id: newVariantId,
                  quantity: item.quantity,
                  price: item.price,
                  fulfillable_quantity: item.fulfillable_quantity,
                };
              }),
              billing_address: order?.billing_address ?? order.shipping_address,
              shipping_address: order.shipping_address,
              email: order.email,
              financial_status: order.financial_status,
              browser_ip: order.browser_ip,
              discount_codes: order.discount_codes,
              fulfillments: order.fulfillments,
              fulfillment_status: order.fulfillment_status,
              name: order.name,
              number: order.number,
              order_number: order.order_number,
              phone: order.phone,
              note: order.note,
              tags: Array.isArray(order.tags) ? order.tags.join(", ") : " ",
              customer: order.customer,
              currency: order.currency,
              shipping_lines: order.shipping_lines,
              tax_lines: order.tax_lines,
              total_discounts: order.total_discounts,
              total_price: order.total_price,
              total_tax: order.total_tax,
              total_weight: order.total_weight,
              transactions: order.transactions,
              processed_at: order.processed_at,
            };

            // Remove source_name as it cannot be set by untrusted API clients
            delete newOrderObj.source_name;

            try {
              const resp = await destinationService.post("/orders.json", {
                order: newOrderObj,
              });
              console.log(
                "SUCCESS: ",
                resp.data.order.id,
                resp.data.order.name
              );
              success.push(order.id);
              lastProcessedOrderId = order.id;
              const order_id = new Order({
                order_id: lastProcessedOrderId,
                status: "success",
              });
              await order_id.save();
            } catch (error) {
              errors.push({
                [order.id]: error?.response?.data?.errors.order,
              });
              const order_id = new Order({
                order_id: order.id,
                status: "failed",
                error: error?.response?.data?.errors.order,
              });
              await order_id.save();
              if (error.response && error.response.status === 429) {
                const retryAfter = error.response.headers["retry-after"]
                  ? parseInt(error.response.headers["retry-after"], 10) * 1000
                  : 60000;
                console.log(
                  `Rate limit hit. Waiting for ${retryAfter / 1000} seconds`
                );
                await sleep(retryAfter);
              }
            }

            await sleep(1000);
          }

          console.log(
            `Processed ${batchOrders.length} orders, waiting before next batch...`
          );
          await sleep(60000);
        }
        console.log("success: ", success);
        console.log("Errors: ", errors);
      }
    );

    return res.status(200).send({ success: "OK" });
  } catch (error) {
    console.log(`Error during sync-orders: ${error.message}`);
    return res.status(500).json({ error: error.message });
  }
});

app.listen(3000, () => {
  console.log("Server is running on port 3000");
});

// {
//     id: 5858595438882,
//     admin_graphql_api_id: 'gid://shopify/Order/5858595438882',
//     app_id: 580111,
//     browser_ip: '125.209.106.82',
//     buyer_accepts_marketing: true,
//     cancel_reason: null,
//     cancelled_at: null,
//     cart_token: 'Z2NwLXVzLWNlbnRyYWwxOjAxSjNOMEFFSzg5WlhIUjFEN0FQVkRKS1pQ',
//     checkout_id: 37653553545506,
//     checkout_token: '1268b761e482932f71a0bcf394b8bc59',
//     client_details: {
//       accept_language: 'en-PK',
//       browser_height: null,
//       browser_ip: '125.209.106.82',
//       browser_width: null,
//       session_hash: null,
//       user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
//     },
//     closed_at: null,
//     confirmation_number: 'MQHKARDMC',
//     confirmed: true,
//     contact_email: 'mariiumarshad@gmail.com',
//     created_at: '2024-07-25T18:13:02+05:00',
//     currency: 'PKR',
//     current_subtotal_price: '2999.00',
//     current_subtotal_price_set: {
//       shop_money: { amount: '2999.00', currency_code: 'PKR' },
//       presentment_money: { amount: '2999.00', currency_code: 'PKR' }
//     },
//     current_total_additional_fees_set: null,
//     current_total_discounts: '0.00',
//     current_total_discounts_set: {
//       shop_money: { amount: '0.00', currency_code: 'PKR' },
//       presentment_money: { amount: '0.00', currency_code: 'PKR' }
//     },
//     current_total_duties_set: null,
//     current_total_price: '2999.00',
//     current_total_price_set: {
//       shop_money: { amount: '2999.00', currency_code: 'PKR' },
//       presentment_money: { amount: '2999.00', currency_code: 'PKR' }
//     },
//     current_total_tax: '0.00',
//     current_total_tax_set: {
//       shop_money: { amount: '0.00', currency_code: 'PKR' },
//       presentment_money: { amount: '0.00', currency_code: 'PKR' }
//     },
//     customer_locale: 'en-PK',
//     device_id: null,
//     discount_codes: [],
//     email: 'mariiumarshad@gmail.com',
//     estimated_taxes: false,
//     financial_status: 'pending',
//     fulfillment_status: null,
//     landing_site: '/',
//     landing_site_ref: null,
//     location_id: null,
//     merchant_of_record_app_id: null,
//     name: '#119446',
//     note: null,
//     note_attributes: [],
//     number: 118446,
//     order_number: 119446,
//     order_status_url: 'https://heelss.myshopify.com/7933362249/orders/4dcca390a33843c16414ee0ec83d54c4/authenticate?key=90158a7b47b1aabc446b26764e7cd506&none=VQBRA1VGXF5XT11G',
//     original_total_additional_fees_set: null,
//     original_total_duties_set: null,
//     payment_gateway_names: [ 'Cash on Delivery (COD)' ],
//     phone: null,
//     po_number: null,
//     presentment_currency: 'PKR',
//     processed_at: '2024-07-25T18:13:01+05:00',
//     reference: '32e0ec3be95adc053ec3568f0bcc5f42',
//     referring_site: '',
//     source_identifier: '32e0ec3be95adc053ec3568f0bcc5f42',
//     source_name: 'web',
//     source_url: null,
//     subtotal_price: '2999.00',
//     subtotal_price_set: {
//       shop_money: { amount: '2999.00', currency_code: 'PKR' },
//       presentment_money: { amount: '2999.00', currency_code: 'PKR' }
//     },
//     tags: '',
//     tax_exempt: false,
//     tax_lines: [],
//     taxes_included: false,
//     test: false,
//     token: '4dcca390a33843c16414ee0ec83d54c4',
//     total_discounts: '0.00',
//     total_discounts_set: {
//       shop_money: { amount: '0.00', currency_code: 'PKR' },
//       presentment_money: { amount: '0.00', currency_code: 'PKR' }
//     },
//     total_line_items_price: '2999.00',
//     total_line_items_price_set: {
//       shop_money: { amount: '2999.00', currency_code: 'PKR' },
//       presentment_money: { amount: '2999.00', currency_code: 'PKR' }
//     },
//     total_outstanding: '2999.00',
//     total_price: '2999.00',
//     total_price_set: {
//       shop_money: { amount: '2999.00', currency_code: 'PKR' },
//       presentment_money: { amount: '2999.00', currency_code: 'PKR' }
//     },
//     total_shipping_price_set: {
//       shop_money: { amount: '0.00', currency_code: 'PKR' },
//       presentment_money: { amount: '0.00', currency_code: 'PKR' }
//     },
//     total_tax: '0.00',
//     total_tax_set: {
//       shop_money: { amount: '0.00', currency_code: 'PKR' },
//       presentment_money: { amount: '0.00', currency_code: 'PKR' }
//     },
//     total_tip_received: '0.00',
//     total_weight: 0,
//     updated_at: '2024-07-25T18:13:04+05:00',
//     user_id: null,
//     billing_address: {
//       first_name: 'maryam',
//       address1: 'model town',
//       phone: '03184383724',
//       city: 'lahore',
//       zip: '0000',
//       province: null,
//       country: 'Pakistan',
//       last_name: 'arshad',
//       address2: null,
//       company: null,
//       latitude: null,
//       longitude: null,
//       name: 'maryam arshad',
//       country_code: 'PK',
//       province_code: null
//     },
//     customer: {
//       id: 8076262080802,
//       email: 'mariiumarshad@gmail.com',
//       created_at: '2024-07-25T18:13:02+05:00',
//       updated_at: '2024-07-25T18:13:03+05:00',
//       first_name: 'maryam',
//       last_name: 'arshad',
//       state: 'disabled',
//       note: null,
//       verified_email: true,
//       multipass_identifier: null,
//       tax_exempt: false,
//       phone: null,
//       email_marketing_consent: {
//         state: 'pending',
//         opt_in_level: 'confirmed_opt_in',
//         consent_updated_at: '2024-07-25T18:13:03+05:00'
//       },
//       sms_marketing_consent: null,
//       tags: '',
//       currency: 'PKR',
//       tax_exemptions: [],
//       admin_graphql_api_id: 'gid://shopify/Customer/8076262080802',
//       default_address: {
//         id: 10047976931618,
//         customer_id: 8076262080802,
//         first_name: 'maryam',
//         last_name: 'arshad',
//         company: null,
//         address1: 'model town',
//         address2: null,
//         city: 'lahore',
//         province: null,
//         country: 'Pakistan',
//         zip: '0000',
//         phone: '03184383724',
//         name: 'maryam arshad',
//         province_code: null,
//         country_code: 'PK',
//         country_name: 'Pakistan',
//         default: true
//       }
//     },
//     discount_applications: [],
//     fulfillments: [],
//     line_items: [
//       {
//         id: 14755333734690,
//         admin_graphql_api_id: 'gid://shopify/LineItem/14755333734690',
//         attributed_staffs: [],
//         current_quantity: 1,
//         fulfillable_quantity: 1,
//         fulfillment_service: 'manual',
//         fulfillment_status: null,
//         gift_card: false,
//         grams: 0,
//         name: 'Black Ethnic Chappal LRG500004 - Black / 42',
//         price: '2999.00',
//         price_set: [Object],
//         product_exists: true,
//         product_id: 9402540884258,
//         properties: [],
//         quantity: 1,
//         requires_shipping: true,
//         sku: ' LRG500004-042-BLK',
//         taxable: false,
//         title: 'Black Ethnic Chappal LRG500004',
//         total_discount: '0.00',
//         total_discount_set: [Object],
//         variant_id: 48923382317346,
//         variant_inventory_management: 'shopify',
//         variant_title: 'Black / 42',
//         vendor: 'Ladies',
//         tax_lines: [],
//         duties: [],
//         discount_allocations: []
//       }
//     ],
//     payment_terms: null,
//     refunds: [],
//     shipping_address: {
//       first_name: 'maryam',
//       address1: 'model town',
//       phone: '03184383724',
//       city: 'lahore',
//       zip: '0000',
//       province: null,
//       country: 'Pakistan',
//       last_name: 'arshad',
//       address2: null,
//       company: null,
//       latitude: 31.4804642,
//       longitude: 74.3239342,
//       name: 'maryam arshad',
//       country_code: 'PK',
//       province_code: null
//     },
//     shipping_lines: [
//       {
//         id: 4743276921122,
//         carrier_identifier: '650f1a14fa979ec5c74d063e968411d4',
//         code: 'Free Shipping',
//         discounted_price: '0.00',
//         discounted_price_set: [Object],
//         is_removed: false,
//         phone: null,
//         price: '0.00',
//         price_set: [Object],
//         requested_fulfillment_service_id: null,
//         source: 'shopify',
//         title: 'Free Shipping',
//         tax_lines: [],
//         discount_allocations: []
//       }
//     ]
//   }
