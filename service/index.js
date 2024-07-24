import dotenv from "dotenv";
import axios from "axios";
import { LATEST_API_VERSION } from "@shopify/shopify-api";
import { sleep } from "../helper/index.js";

import { fetchPaginatedList } from "../helper/fetch-paginated-list.js";

dotenv.config();

export default class ShopifyService {
  shop_name = null;
  accessToken = null;
  isLimitExceed;
  maxLimit;
  axios;

  constructor({ shop_name, accessToken }) {
    this.shop_name = shop_name;
    this.accessToken = accessToken;
    this.isLimitExceed = false;
    this.maxLimit = 40;

    this.$init();
  }

  $init() {
    const service = axios.create({
      baseURL: `https://${this.shop_name}/admin/api/${LATEST_API_VERSION}`,
    });

    service.interceptors.request.use(
      async (config) => {
        config.headers["Content-Type"] = "application/json";
        config.headers["X-Shopify-Access-Token"] = this.accessToken;
        if (this.isLimitExceed) await sleep(10000);
        return config;
      },
      (error) => {
        console.log("{error }", error);
        return Promise.reject(error);
      }
    );
    service.interceptors.response.use(
      async (config) => {
        await this.checkForApiLimit(config);
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    this.axios = service;
    return this;
  }

  limitExceed(requestMade) {
    if (!requestMade) return false;
    const arr = requestMade.split("/");
    const current = +arr[0];
    const total = +arr[1];
    this.isLimitExceed = current > (total == 80 ? 50 : 20);
    this.maxLimit = total;
    return this.isLimitExceed;
  }

  async checkForApiLimit(options) {
    const { headers } = options;
    const apiLimit = headers["x-shopify-shop-api-call-limit"];

    if (this.limitExceed(apiLimit)) return sleep(10000);
    return sleep(150);
  }

  async get(path) {
    return this.axios.get(path);
  }
  async post(path, body = {}) {
    return this.axios.post(path, body);
  }
  async delete(path) {
    return this.axios.delete(path);
  }
  async put(path, body = {}) {
    return this.axios.put(path, body);
  }

  async getShopDetails() {
    const resp = await this.get("/shop.json");
    return resp.data.shop;
  }

  async getOrders() {
    const { orders } = await fetchPaginatedList(
      this,
      "orders",
      null,
      null,
      null,
      null
      //   true
    );
    return { orders };
  }
  async createOrder(order) {
    const response = await this.post("/orders.json", { order });
    console.log("@@@", response);
    return response.data;
  }
  async createOrdertest(order) {
    // console.log("order@@@@@", order.line_items);
    const maxRetries = 5;
    let attempts = 0;
    let success = false;
    let response;

    while (!success && attempts < maxRetries) {
      try {
        response = await this.post("/orders.json", { order });

        success = true;
      } catch (error) {
        if (
          error.response?.status === 429 ||
          error.response?.data?.errors ===
            "Exceeded order API rate limit, please try again in a minute. Upgrade to a paid account to remove this limit."
        ) {
          console.log("Rate limit exceeded. Retrying in 60 seconds...");
          await sleep(60000); // Wait for 60 seconds before retrying
          attempts++;
        } else {
          throw error;
        }
      }
    }

    if (!success) {
      throw new Error(
        "Failed to create order after multiple attempts due to rate limiting."
      );
    }

    await sleep(1000); // pause 1 second after each order creation

    return response.data;
  }
}
