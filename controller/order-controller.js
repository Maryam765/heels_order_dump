// import { Request, Response } from "express";
// import prismaClient from "../db/prisma/index"
import Service from "../service/index.js";
// import { WINDSOR_API_KEY } from "../config/index"
// import { createAccountEntry } from "../helper/index"

export const getOrders = async (req, res) => {
  try {
    // const axiosService = new Service().init();
    const axiosService = new Service({
      shop_name: "heelss.myshopify.com",
      accessToken: "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",
    }).$init();
    const smartCollection = await axiosService.get(`/smart_collections.json`);
    console.log("smart ???", smartCollection);
    res.status(200).json({ message: "user entries created" });
  } catch (e) {
    res.status(500).json({ error: "Error in createCustomer", e });
  }
};

// app.get("order",(req,res) => {
//     try {
//       const response = await axios.get(
//         `https://${SHOPIFY_SHOP_NAME}.myshopify.com/admin/api/2024-07/orders.json`,
//         {
//           headers: {
//             'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
//             'Content-Type': 'application/json'
//           }
//         }
//       );
//       console.log(response.data);
//     } catch (error) {
//       console.error('Error fetching orders:', error.response.data);
//     }
//   })
//   const fetchOrders = async () => {
//     try {
//       const response = await axios.get(
//         `https://${SHOPIFY_SHOP_NAME}.myshopify.com/admin/api/2024-07/orders.json`,
//         {
//           headers: {
//             'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
//             'Content-Type': 'application/json'
//           }
//         }
//       );
//       console.log(response.data);
//     } catch (error) {
//       console.error('Error fetching orders:', error.response.data);
//     }
//   };
