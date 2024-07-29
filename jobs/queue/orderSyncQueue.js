import Queue from "bull";
import Service from "../../service/index.js";
import { redisClient } from "../../db/redis/index.js";
import { sleep } from "../../helper/index.js";
import {
  paginationWithCallback,
  paginationWithCallbackForProducts,
} from "../../helper/index.js";
import { Order } from "../../model/order.js";
const QUEUE_NAME = "GET_ORDER_QUEUE";
const CONCURRENT = 150;
const JOB_FAIL_RETRIES = 3;
let lastProcessedOrderId = null;
const options = {
  redis: redisClient,
  removeOnFailure: true,
  removeOnSuccess: true,
};

// const queue = new Queue(QUEUE_NAME,
//     options);

const queue = new Queue(QUEUE_NAME, {
  redis: {
    port: Number(process.env.REDIS_PORT),

    host: process.env.REDIS_HOST,
  },
});

export const startOrderSyncQueue = (order) => {
  return queue.add(order, {
    attempts: JOB_FAIL_RETRIES,
  });
};
export async function getOrderSyncQueueDetails() {
  const details = await queue.getActive();
  return {
    details,
  };
}

const getVariants = async (service) => {
  let variants = [];
  await paginationWithCallbackForProducts(
    {
      service,
      path: "/products.json",
    },
    async (products) => {
      products.forEach((product) => {
        product.variants.forEach((variant) => {
          variants.push({
            variant_sku: variant.sku,
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
      (destVariant) => destVariant.variant_sku === sourceVariant.variant_sku
    );
    if (destinationVariant) {
      variantMap.set(sourceVariant.variant_id, destinationVariant.variant_id);
    }
  });
  return variantMap;
};

queue.on("completed", () => {
  console.log(`${QUEUE_NAME} JOB COMPLETED`);
});

queue.on("error", (err) => {
  console.log(`${QUEUE_NAME}  JOB ERROR`, err);
  if (lastProcessedOrderId) {
    console.log(
      `Last processed order ID before error: ${lastProcessedOrderId}`
    );
  }
});

queue.on("retrying", ({ data }, err) => {
  console.log(`${QUEUE_NAME}  JOB retrying`);
});

queue.on("stalled", () => {
  console.log(`${QUEUE_NAME}  JOB STALLED`);
});

queue.on("failed", async (job, err) => {
  console.log(`${QUEUE_NAME}  JOB FAILED`, err);
  if (lastProcessedOrderId) {
    console.log(
      `Last processed order ID before failure: ${lastProcessedOrderId}`
    );
  }
});

queue.on("job progress", async (details) => {
  console.log(details);
});

queue.process(CONCURRENT, async (job) => {
  let lastProcessedOrderId = null;
  const sourceService = new Service({
    shop_name: process.env.SHOP_NAME_OLD,
    accessToken: process.env.ACCESS_TOKEN_OLD,
  });
  const destinationService = new Service({
    shop_name: process.env.SHOP_NAME,
    accessToken: process.env.ACCESS_TOKEN,
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
        // const orderResp = await sourceService.get("/orders.json?limit=2");
        // const orders = orderResp.data.orders;
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
                  fulfillable_quantity: item?.fulfillable_quantity,
                };
              }),
              billing_address: order.billing_address ?? order.shipping_address,
              shipping_address: order.shipping_address,
              email: order.email,
              financial_status: order.financial_status,
              fulfillment_status: order.fulfillment_status,
              name: order.name,
              order_number: order.order_number,
              customer: order.customer,
              currency: order.currency,
              total_price: order.total_price,
              discount_codes: order.discount_codes,
              name: order.name,
              number: order.number,
              order_number: order.order_number,
              phone: order.phone,
              note: order.note,
              tags: Array.isArray(order.tags) ? order.tags : [order.tags],
              customer: order.customer,
              currency: order.currency,
              shipping_lines: order.shipping_lines,
              source_name: order.source_name,
              tax_lines: order.tax_lines,
              total_discounts: order.total_discounts,
              total_price: order.total_price,
              total_tax: order.total_tax,
              total_weight: order.total_weight,
              transactions: order.transactions,
              processed_at: order.processed_at,
            };
            delete newOrderObj.source_name;

            try {
              const resp = await destinationService.post("/orders.json", {
                order: newOrderObj,
              });
              console.log(
                "SUCCESS: ",
                resp.data.order.id,
                resp.data.order.name,
                order.line_items.map((item) => item.variant_id)
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
                [order.id]: error?.response?.data?.errors,
              });
              const order_id = new Order({
                order_id: order.id,
                status: "failed",
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
  } catch (error) {
    console.log("### Error in ORDER SYNC Queue ###", error);
    if (lastProcessedOrderId) {
      console.log(
        `Last processed order ID before error: ${lastProcessedOrderId}`
      );
    }
  }
});
