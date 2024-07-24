export const parseHeaderLink = (link) => {
  let nextPageInfo, prevPageInfo;

  if (link) {
    const parentArr = link.split(" ");

    const extractLink = (str) => {
      str = str.replace("<", "").replace(">;", "");
      const queryPart = str.split("?")[1];
      const queries = queryPart.split("&");
      const idx = queries.findIndex((q) => q.includes("page_info"));
      const pageInfo = queries[idx].split("=")[1];
      return pageInfo;
    };

    if (parentArr.length > 2) {
      prevPageInfo = extractLink(parentArr[0]);
      nextPageInfo = extractLink(parentArr[2]);
    } else {
      if (link.includes("next")) {
        nextPageInfo = extractLink(parentArr[0]);
      }
    }
  }

  return {
    nextPageInfo,
    prevPageInfo,
  };
};
