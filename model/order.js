import mongoose from "mongoose";
const order = new mongoose.Schema(
  {
    order_id: String,
    status: String,
  },

  {
    timestamps: true,
  }
);

export const Order = mongoose.model("Order", order);
