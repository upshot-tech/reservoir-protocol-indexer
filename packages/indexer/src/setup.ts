import "@/jobs/index";
import "@/jobs/cdc/index";
import "@/config/polyfills";
import "@/pubsub/index";
import "@/websockets/index";

import { start } from "@/api/index";
import { logger } from "@/common/logger";
import { config } from "@/config/index";
import { getNetworkSettings } from "@/config/network";
import { initIndexes } from "@/elasticsearch/indexes";
import { startKafkaConsumer } from "@/jobs/cdc";
import { RabbitMqJobsConsumer } from "@/jobs/index";
import { Sources } from "@/models/sources";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
process.on("unhandledRejection", (error: any) => {
  logger.error("process", `Unhandled rejection: ${error} (${error.stack})`);

  // For now, just skip any unhandled errors
  // process.exit(1);
});

const setup = async () => {
  if (Number(process.env.LOCAL_TESTING)) {
    return;
  }

  if (config.doBackgroundWork) {
    await Sources.syncSources();
    await RabbitMqJobsConsumer.startRabbitJobsConsumer();

    const networkSettings = getNetworkSettings();
    if (networkSettings.onStartup) {
      await networkSettings.onStartup();
    }
  }

  await Sources.getInstance();
  await Sources.forceDataReload();

  if (config.doElasticsearchWork) {
    await initIndexes();
  }

  if (config.doKafkaWork) {
    await startKafkaConsumer();
  }
};

setup().then(() => start());
