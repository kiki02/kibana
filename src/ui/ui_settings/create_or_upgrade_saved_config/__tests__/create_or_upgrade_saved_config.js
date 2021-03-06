/*
 * Licensed to Elasticsearch B.V. under one or more contributor
 * license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright
 * ownership. Elasticsearch B.V. licenses this file to you under
 * the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import sinon from 'sinon';
import Chance from 'chance';

import * as getUpgradeableConfigNS from '../get_upgradeable_config';
import { createOrUpgradeSavedConfig } from '../create_or_upgrade_saved_config';

const chance = new Chance();

describe('uiSettings/createOrUpgradeSavedConfig', function () {
  const sandbox = sinon.createSandbox();
  afterEach(() => sandbox.restore());

  const version = '4.0.1';
  const prevVersion = '4.0.0';
  const buildNum = chance.integer({ min: 1000, max: 5000 });

  function setup() {
    const log = sinon.stub();
    const getUpgradeableConfig = sandbox.stub(getUpgradeableConfigNS, 'getUpgradeableConfig');
    const savedObjectsClient = {
      create: sinon.spy(async (type, attributes, options = {}) => ({
        type,
        id: options.id,
        version: 1,
      }))
    };

    async function run() {
      const resp = await createOrUpgradeSavedConfig({
        savedObjectsClient,
        version,
        buildNum,
        log,
      });

      sinon.assert.calledOnce(getUpgradeableConfig);
      sinon.assert.alwaysCalledWith(getUpgradeableConfig, { savedObjectsClient, version });

      return resp;
    }

    return {
      buildNum,
      log,
      run,
      version,
      savedObjectsClient,
      getUpgradeableConfig,
    };
  }

  describe('nothing is upgradeable', function () {
    it('should create config with current version and buildNum', async () => {
      const { run, savedObjectsClient } = setup();

      await run();

      sinon.assert.calledOnce(savedObjectsClient.create);
      sinon.assert.calledWithExactly(savedObjectsClient.create, 'config', {
        buildNum,
      }, {
        id: version
      });
    });
  });

  describe('something is upgradeable', () => {
    it('should merge upgraded attributes with current build number in new config', async () => {
      const {
        run,
        getUpgradeableConfig,
        savedObjectsClient
      } = setup();

      const savedAttributes = {
        buildNum: buildNum - 100,
        [chance.word()]: chance.sentence(),
        [chance.word()]: chance.sentence(),
        [chance.word()]: chance.sentence()
      };

      getUpgradeableConfig
        .returns({ id: prevVersion, attributes: savedAttributes });

      await run();

      sinon.assert.calledOnce(getUpgradeableConfig);
      sinon.assert.calledOnce(savedObjectsClient.create);
      sinon.assert.calledWithExactly(savedObjectsClient.create,
        'config',
        {
          ...savedAttributes,
          buildNum,
        },
        {
          id: version,
        }
      );
    });

    it('should log a message for upgrades', async () => {
      const { getUpgradeableConfig, log, run } = setup();

      getUpgradeableConfig
        .returns({ id: prevVersion, attributes: { buildNum: buildNum - 100 } });

      await run();
      sinon.assert.calledOnce(log);
      sinon.assert.calledWithExactly(log,
        ['plugin', 'elasticsearch'],
        sinon.match({
          tmpl: sinon.match('Upgrade'),
          prevVersion,
          newVersion: version,
        })
      );
    });
  });
});