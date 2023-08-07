import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

// import { Ditto } from "@reservoir0x/sdk";
import * as ditto from "@/utils/ditto";
import * as orders from "@/orderbook/orders";
import { logger } from "@/common/logger";
import { getOrder } from "../utils/order";

const poolAddress = "0x879AF4c23f1d005cAb4bf2518DEfB27B32B8a65c";
const token = "0xb4fbf271143f4fbf7b91a5ded31805e42b2208d6";
const nft = "0x2afbae4b3fd9c1088de2e05aff6b5f8adb40c387";
// const fee = "20000000000000000"

describe("DittoTest", () => {
  test("Create Pool", async () => {
    const pool = await ditto.getPoolDetails(poolAddress);
    logger.info(
      "ditto-test",
      `pool: ${pool?.address} , token: ${pool?.token}, NFT: ${pool?.nft}, fee: ${pool?.fee}`
    );
    expect(pool).toBeDefined();
    expect(pool?.address?.toLowerCase()).toBe(poolAddress.toLowerCase());
    expect(pool?.token?.toLowerCase()).toBe(token.toLowerCase());
    expect(pool?.nft?.toLowerCase()).toBe(nft.toLowerCase());
  });

  test("Create Order", async () => {
    const params = {
      pool: "0x879AF4c23f1d005cAb4bf2518DEfB27B32B8a65c",
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
