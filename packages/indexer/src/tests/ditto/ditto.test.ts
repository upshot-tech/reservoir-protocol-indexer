import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

// import { Ditto } from "@reservoir0x/sdk";
import * as ditto from "@/utils/ditto";
import * as orders from "@/orderbook/orders";
import { logger } from "@/common/logger";
import { getOrder } from "../utils/order";

describe("DittoTest", () => {
  test("Create Pool", async () => {
    const poolAddress = "0x879AF4c23f1d005cAb4bf2518DEfB27B32B8a65c";
    const pool = await ditto.getPoolDetails(poolAddress);
    expect(pool).toBeDefined();
    expect(pool?.address?.toLowerCase()).toBe(poolAddress.toLowerCase());
  });

  test("Create Order", async () => {
    const params = {
      pool: "1",
      nftIds: [""],
      lpIds: "1",
      expectedTokenAmount: "1",
      recipient: "",
      swapData: "",
      permitterData: "",
      extra: {
        prices: ["100000000000000000"],
      },
      txHash: "tx_hash",
      txTimestamp: 1690710927,
      txBlock: 1,
      logIndex: 1,
      deadline: 1690710927,
    };

    // const chainId = 1;
    // const buyOrder = new Ditto.Order(chainId, params);
    // await buyOrder.sign(buyer);

    const orderInfo: orders.ditto.OrderInfo = {
      orderParams: params,
      metadata: {},
    };

    const orderId = orders.ditto.getOrderId(params.lpIds);
    logger.info("DittoTest", `Save orderId: ${orderId} to database`);

    // Store order to database
    await orders.ditto.save([orderInfo]);
    logger.info("DittoTest", `Save ${orderId} to database`);
    // await wait(10 * 1000);

    const orderStatus = await getOrder(orderId);
    logger.info("DittoTest", `Order status ${JSON.stringify(orderStatus)}`);
  });
});
