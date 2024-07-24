import express from "express";
import dotenv from "dotenv";
import Service from "./service/index.js";
import { sleep } from "./helper/index.js";
import {
  startOrderQueue,
  getOrderQueueDetails,
} from "../src/jobs/queue/orderQueue.js";

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
  const service = new Service({
    shop_name: "testpython43.myshopify.com",
    accessToken: "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",
  });

  const orderResp = await service.get("/orders.json?limit=3");
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
      tags: order?.tags ?? "test",
      customer: order?.customer,
    };

    console.log("tags ", order.tags);

    try {
      const resp = await service.post("/orders.json", {
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

  return res.status(200).send({ success: "OK" });
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
