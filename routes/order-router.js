import express from "express";
import * as OrderController from "../controller/order-controller.js";

const router = express.Router();

router.get("/get-order", OrderController.getOrders);

export default router;
