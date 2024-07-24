import { MAX_SHOPIFY_LIMIT } from "../constant/index.js";

import { parseHeaderLink } from "./parse-header-link.js";

export const fetchPaginatedList = async (
  service,
  path,
  byCollectionId = null,
  query = null,
  key = null,
  orderStatus = null,
  inventoryIds = null
) => {
  let pageInfo;
  let hasNext = "";
  let allList = [];
  let dynamicPath = key ?? path;

  do {
    let url = `/${path}.json?limit=${MAX_SHOPIFY_LIMIT}`;

    if (byCollectionId)
      url = `/${path}.json?collection_id=${byCollectionId}&limit=${MAX_SHOPIFY_LIMIT}`;

    if (orderStatus)
      url = `/${path}.json?status=any&limit=${MAX_SHOPIFY_LIMIT}`;

    if (inventoryIds)
      url = `/${path}.json?ids=${inventoryIds}&limit=${MAX_SHOPIFY_LIMIT}`;

    if (query) url = `${url}&${query}`;

    if (pageInfo && !byCollectionId) {
      url = `${url}&page_info=${pageInfo}`;
    }

    if (pageInfo && byCollectionId) {
      url = `/${path}.json?limit=${MAX_SHOPIFY_LIMIT}&page_info=${pageInfo}`;
    }

    try {
      const resp = await service.get(url);
      const lists = resp.data[dynamicPath];
      allList = [...allList, ...lists];
      const { nextPageInfo } = parseHeaderLink(resp.headers.link);
      hasNext = nextPageInfo;
      if (hasNext) {
        pageInfo = nextPageInfo;
      }
    } catch (err) {
      // catch (err) {
      //   console.log("Some Paginated Error", err);
      // }
      console.log(
        "Some Paginated Error",
        err.response ? err.response.data.errors : err.message
      );
    }

    if (hasNext === undefined) {
      break;
    }
  } while (hasNext !== "");

  return {
    [dynamicPath]: allList,
  };
};
