// A Jest environment whose tests can change the time zone for real.
//
// Jest hands each test file its own copy of `process.env`, so a test that sets
// `process.env.TZ` changes nothing and every case runs in the machine's zone.
// This environment sets it on the worker's own process, where Node applies it
// to every `Date`, and gives the test a `setTimeZone(zone)` global to do so
// (`undefined` restores the machine's zone).
const { TestEnvironment } = require('jest-environment-node');

class TimeZoneEnvironment extends TestEnvironment {
  constructor(config, context) {
    super(config, context);
    const original = process.env.TZ;
    this.restore = () => {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    };
    this.global.setTimeZone = (zone) => {
      if (zone === undefined) this.restore();
      else process.env.TZ = zone;
    };
  }

  async teardown() {
    this.restore();
    await super.teardown();
  }
}

module.exports = TimeZoneEnvironment;
