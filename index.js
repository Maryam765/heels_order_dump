import express from "express";
import dotenv from "dotenv";
import Service from "./service/index.js";
import { sleep } from "./helper/index.js";
import {
  startOrderQueue,
  getOrderQueueDetails,
} from "../src/jobs/queue/orderQueue.js";

import { paginationWithCallback } from "../src/helper/index.js";
import "../src/db/mongo/index.js";
import { Order } from "../src/model/order.js";
dotenv.config();

const app = express();
const port = 3000;

app.use(express.json());

app.get("/orders/sync-orders", async (req, res) => {
  const orderQueue = await startOrderQueue({});
  return res.status(200).send({
    orderQueue,
  });
});
app.get("/queue-info", async (req, res) => {
  const orderQueue = await getOrderQueueDetails();
  return res.status(200).send({
    orderQueue,
  });
});

app.get("/sync-orders", async (req, res) => {
  let lastProcessedOrderId = null;
  // const service = new Service({
  // shop_name: "maryam-pro.myshopify.com/",
  // accessToken: process.env.ACCESS_TOKEN_MARYAM,
  // });
  const axiosService_from = new Service({
    shop_name: "heelss.myshopify.com/",
    accessToken: process.env.ACCESS_TOKEN_OLD,
  });
  const axiosService_to = new Service({
    shop_name: "maryam-pro.myshopify.com/",
    accessToken: process.env.ACCESS_TOKEN_MARYAM,
  });

  try {
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
              const order_id = new Order({
                order_id: lastProcessedOrderId,
                status: "Success",
              });

              await order_id.save();
            } catch (error) {
              errors.push({
                [order.id]: error?.response?.data?.errors,
              });
              console.log("FAILED: ", order.id, order.name);
              lastProcessedOrderId = order.id;
              const order_id = new Order({
                order_id: lastProcessedOrderId,
                status: "Failed",
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
    res.status(500).json({ error: error.message });
  }
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
