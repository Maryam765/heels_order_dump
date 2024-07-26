import express from "express";

import * as OrderSyncController from "../controller/order-sync-controller.js";

const router = express.Router();

router.get("/sync-orders", OrderSyncController.syncOrders);
router.get("/queue/sync-orders", OrderSyncController.syncOrderByQueue);
router.get("/queue/info", OrderSyncController.queueInfo);

export default router;
