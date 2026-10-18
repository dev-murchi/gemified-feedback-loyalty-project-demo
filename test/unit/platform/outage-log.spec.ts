import { OutageLog } from '../../../src/platform/redis/outage-log.js';
import { RecordingLogger } from '../../support/recording-logger.js';

const setup = () => {
  const logger = new RecordingLogger();
  return {
    logger,
    outage: new OutageLog({ logger, down: 'X is down', up: 'X is back' }),
  };
};

describe('OutageLog', () => {
  it('warns once per outage, with the error name only', () => {
    const { logger, outage } = setup();

    for (let i = 0; i < 10; i += 1)
      outage.failed(new Error('connect to 10.0.0.7:6379 refused'));

    expect(logger.warnings).toEqual([
      { message: 'X is down', fields: { error: 'Error' } },
    ]);
  });

  it('says nothing about a success when there was no outage', () => {
    const { logger, outage } = setup();

    outage.recovered();
    outage.recovered();

    expect(logger.infos).toEqual([]);
  });

  it('logs the recovery once, and warns again for the next outage', () => {
    const { logger, outage } = setup();
    outage.failed(new Error('down'));

    outage.recovered();
    outage.recovered();
    outage.failed('not an error object');

    expect(logger.infos).toEqual([{ message: 'X is back', fields: {} }]);
    expect(logger.warnings.map((warning) => warning.fields)).toEqual([
      { error: 'Error' },
      { error: 'string' },
    ]);
  });
});
