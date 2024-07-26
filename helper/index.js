import { parseHeaderLink } from "../helper/parse-header-link.js";

export const sleep = (time = 10000) => {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      resolve(true);
    }, time);
  });
};

export async function paginationWithCallback(
  { path, query = null, service, limit = 250 },
  cb
) {
  return new Promise(async (resolve, reject) => {
    let hasNext = true;
    let pageInfo = null;

    while (hasNext) {
      let url = path + `?limit=${limit}`;
      if (query) url = `${url}&${query}`;
      if (pageInfo) url = `${url}&page_info=${pageInfo}`;
      const resp = await service.get(url);
      const { nextPageInfo } = parseHeaderLink(resp.headers.link);
      const data = resp.data.orders;
      if (nextPageInfo) {
        pageInfo = nextPageInfo.replace(">;", "");
      } else {
        pageInfo = null;
        hasNext = false;
      }

      await cb(data);
    }

    resolve();
  });
}

export async function paginationWithCallbackForProducts(
  { path, query = null, service, limit = 250 },
  cb
) {
  return new Promise(async (resolve, reject) => {
    let hasNext = true;
    let pageInfo = null;

    while (hasNext) {
      let url = path + `?limit=${limit}`;
      if (query) url = `${url}&${query}`;
      if (pageInfo) url = `${url}&page_info=${pageInfo}`;
      const resp = await service.get(url);
      const { nextPageInfo } = parseHeaderLink(resp.headers.link);
      const data = resp.data.products; // For products

      if (nextPageInfo) {
        pageInfo = nextPageInfo.replace(">;", "");
      } else {
        pageInfo = null;
        hasNext = false;
      }

      await cb(data);
    }

    resolve();
  });
}
