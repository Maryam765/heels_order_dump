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

app.get("/", async (req, res) => {
  // const axiosService = new Service({
  //   shop_name: "heelss.myshopify.com",
  //   accessToken: "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",
  // }).$init();

  const axiosService_old = new Service({
    shop_name: "testpython43.myshopify.com",
    accessToken: "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",
  }).$init();

  const axiosService_new = new Service({
    shop_name: "testpython43.myshopify.com/",
    accessToken: "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",
  }).$init();

  const { orders } = await axiosService_old.getOrders();
  // console.log("order ??? @@@@@@", orders.length);
  for (const order of orders) {
    console.log(
      "line item ",
      // order,
      order.line_items,
      order.line_items?.map((item) => ({
        variant_id: item.variant_id,
        quantity: item.quantity,
      }))
    );
    if (!order.line_items || order.line_items.length === 0) {
      console.error("Skipping order due to missing line items:", order.id);
      continue; // Skip this order if there are no line items
    }
    const newOrder = {
      order: {
        line_items: [
          {
            variant_id: 41948447670433,
            quantity: 1,
          },
        ],
        billing_address: {
          first_name: "maryam",
          // order.billing_address?.first_name,
          last_name: "maryam",
          //  order.billing_address?.last_name,
          address1: "asd",
          // order.billing_address?.address1,
          phone: 555,
          // order.billing_address?.phone,
          city: "sd",
          // order.billing_address?.city,
          country: "sfd",
          // order.billing_address?.country,
        },
        shipping_address: {
          first_name: "maryam",
          // order.billing_address?.first_name,
          last_name: "maryam",
          //  order.billing_address?.last_name,
          address1: "asd",
          // order.billing_address?.address1,
          phone: 555,
          // order.billing_address?.phone,
          city: "sd",
          // order.billing_address?.city,
          country: "sfd",
          // order.billing_address?.country,
        },
        email: "ad@gh",
        //  order.email,
        financial_status: "paid",
        // order.financial_status,
        shipping_lines: [
          {
            price: 100,
            title: "free",
          },
        ],
        // order.shipping_lines?.map((line) => ({
        //   price: line.price,
        //   title: line.title,
        // })) || [],
        // note: order.note,
        // note_attributes: order.note_attributes,
        // discount_codes:
        //   order.discount_codes?.map((discount) => ({
        //     code: discount.code,
        //     amount: discount.amount,
        //     type: discount.type,
        //   })) || [],
        // customer: order.customer,
      },
    };
    try {
      const createdOrder = await axiosService_new.createOrder(newOrder);
      console.log("Created Order:", createdOrder.id);
      await sleep(10000);
    } catch (error) {
      console.error(
        "Error creating order:",
        error.response?.data || error.message
      );
    }
  }
  res.status(200).json({
    message: "order fetched ",
    // orders,
  });
  // fulfilment
  // res.send("Hello World");
});
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

// const payload = {
//   order: {
//     line_items: body.lineItems,

//     billing_address: {
//       first_name: body.inputValues.firstName,
//       last_name: body.inputValues.lastName,
//       address1: body.inputValues.address,
//       phone: body.inputValues.phoneNumber,
//       city: body.inputValues.city,
//       country: body.inputValues.country,
//     },
//     shipping_address: {
//       first_name: body.inputValues.firstName,
//       last_name: body.inputValues.lastName,
//       address1: body.inputValues.address,
//       phone: body.inputValues.phoneNumber,
//       city: body.inputValues.city,
//       country: body.inputValues.country,
//     },
//     email: body.inputValues.email,

//     financial_status: "pending",
//     shipping_lines: [
//       {
//         price: body.shippingRate.shippingPrice,
//         title: body.shippingRate.shippingName,
//       },
//     ],
//     note: body.inputValues.orderNote,
//     note_attributes: body.note_attributes,
//     discount_codes: body.discount,
//   },
// };

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
