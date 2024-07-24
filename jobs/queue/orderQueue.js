import dotenv from "dotenv";
dotenv.config();
import Queue from "bull";
import Service from "../../service/index.js";
import { redisClient } from "../../db/redis/index.js";
import { sleep } from "../../helper/index.js";
const QUEUE_NAME = "GET_ORDER_QUEUE";
const CONCURRENT = 150;
const JOB_FAIL_RETRIES = 3;

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
});

queue.on("retrying", ({ data }, err) => {
  console.log(`${QUEUE_NAME}  JOB retrying`);
});

queue.on("stalled", () => {
  console.log(`${QUEUE_NAME}  JOB STALLED`);
});

queue.on("failed", async (job, err) => {
  console.log(`${QUEUE_NAME}  JOB FAILED`, err);
});

queue.on("job progress", async (details) => {
  console.log(details);
});

queue.process(CONCURRENT, async (job) => {
  try {
    const axiosService_old = new Service({
      shop_name: "testpython43.myshopify.com",
      accessToken: process.env.ACCESS_TOKEN_TEST,
    });
    const axiosService_new = new Service({
      shop_name: "testpython43.myshopify.com",
      accessToken: process.env.ACCESS_TOKEN_TEST,
    });

    // const { orders } = await axiosService_old.getOrders();
    // console.log("order ??? @@@@@@", orders.length);

    const orderResp = await axiosService_old.get("/orders.json?limit=3");
    const orders = orderResp.data.orders;

    let errors = [];
    let success = [];

    for (const order of orders) {
      const newOrderObj = {
        line_items: order.line_items.map((item) => ({
          variant_id: item.variant_id,
          quantity: item.quantity,
          price: item.price,
          fulfillable_quantity: item.fulfillable_quantity,
        })),
        billing_address: order?.billing_address ?? order.shipping,
        shipping_address: order.shipping,
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
        // tags: order?.tags ?? "test",
      };

      try {
        const resp = await axiosService_new.post("/orders.json", {
          order: newOrderObj,
        });
        console.log("SUCCESS: ", resp.data.order.id);
        success.push(order.id);
      } catch (error) {
        errors.push({
          [order.id]: error?.response?.data?.errors,
        });
      }

      await sleep(13000);
    }

    console.log("success: ", success);
    console.log("Errors: ", errors);
  } catch (error) {
    console.log(error);
    return;
  }
});
