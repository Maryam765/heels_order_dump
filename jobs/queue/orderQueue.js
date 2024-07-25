import Queue from "bull";
import Service from "../../service/index.js";
import { redisClient } from "../../db/redis/index.js";
import { sleep } from "../../helper/index.js";
import { paginationWithCallback } from "../../helper/index.js";
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

export const startOrderQueue = (order) => {
  return queue.add(order, {
    attempts: JOB_FAIL_RETRIES,
  });
};
export async function getOrderQueueDetails() {
  const details = await queue.getActive();
  return {
    details,
  };
}

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
  try {
    const axiosService_from = new Service({
      shop_name: "testpython43.myshopify.com",
      accessToken: "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",
    });
    const axiosService_to = new Service({
      shop_name: "testpython43.myshopify.com",
      accessToken: "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",
    });

    await paginationWithCallback(
      {
        axiosService_from,
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
              line_items: order.line_items.map((item) => ({
                variant_id: item.variant_id,
                quantity: item.quantity,
                price: item.price,
                fulfillable_quantity: item.fulfillable_quantity,
              })),
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
              source_name: order.source_name,
              tax_lines: order.tax_lines,
              total_discounts: order.total_discounts,
              total_price: order.total_price,
              total_tax: order.total_tax,
              total_weight: order.total_weight,
              transactions: order.transactions,
              processed_at: order.processed_at,
            };

            try {
              const resp = await axiosService_to.post("/orders.json", {
                order: newOrderObj,
              });
              console.log(
                "SUCCESS: ",
                resp.data.order.id,
                resp.data.order.name
              );
              success.push(order.id);
              lastProcessedOrderId = order.id;
            } catch (error) {
              errors.push({
                [order.id]: error?.response?.data?.errors,
              });
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
    console.log("### Error in Queue ###", error);
    if (lastProcessedOrderId) {
      console.log(
        `Last processed order ID before error: ${lastProcessedOrderId}`
      );
    }
  }
});
