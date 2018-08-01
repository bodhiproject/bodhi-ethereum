const Web3Beta = require('web3');
const web3 = new Web3Beta(global.web3.currentProvider);
const chai = require('chai');
const bluebird = require('bluebird');
const { each } = require('lodash');
const Qweb3Utils = require('qweb3').Utils;
const Encoder = require('qweb3').Encoder;

const StandardEvent = artifacts.require('./event/StandardEvent.sol');
const CentralizedOracle = artifacts.require('./oracle/CentralizedOracle.sol');
const DecentralizedOracle = artifacts.require('./oracle/DecentralizedOracle.sol');
const ContractHelper = require('../util/contract_helper');
const SolAssert = require('../util/sol_assert');
const TimeMachine = require('../util/time_machine');
const Abi = require('../util/abi');
const { EventHash, EventStatus } = require('../util/constants');
const Utils = require('../util/');

const { assert } = chai;

const getEventParams = (oracle) => {
  const currTime = Utils.currentBlockTime();
  return {
    _oracle: oracle,
    _name: ['Will Apple stock reach $300 by t', 'he end of 2017?'],
    _resultNames: ['A', 'B', 'C'],
    _bettingStartTime: currTime + 1000,
    _bettingEndTime: currTime + 3000,
    _resultSettingStartTime: currTime + 4000,
    _resultSettingEndTime: currTime + 6000,
  };
};

contract('StandardEvent', (accounts) => {
  const BET_TOKEN_DECIMALS = 18;
  const OWNER = accounts[0];
  const ACCT1 = accounts[1];
  const ACCT2 = accounts[2];
  const ACCT3 = accounts[3];
  const ACCT4 = accounts[4];
  const RESULT_INVALID = 'Invalid';
  const timeMachine = new TimeMachine(web3);

  let tokenDecimals;
  let thresholdIncrease;
  let addressManager;
  let token;
  let tokenWeb3Contract;
  let eventParams;
  let event;
  let cOracle;

  beforeEach(async () => {
    await timeMachine.mine();
    await timeMachine.snapshot();

    const baseContracts = await ContractHelper.initBaseContracts(OWNER, accounts);
    addressManager = baseContracts.addressManager;
    tokenDecimals = await addressManager.tokenDecimals.call();
    thresholdIncrease = await addressManager.thresholdPercentIncrease.call();

    token = baseContracts.bodhiToken;
    tokenWeb3Contract = new web3.eth.Contract(Abi.BodhiEthereum, token.address);
    
    const eventFactory = baseContracts.eventFactory;
    eventParams = getEventParams(OWNER);
    const tx = await eventFactory.createStandardEvent(...Object.values(eventParams), { from: OWNER });
    SolAssert.assertEvent(tx, 'StandardEventCreated');

    let eventAddress;
    let cOracleAddress;
    each(tx.receipt.logs, (log) => {
      if (log.topics[0] === EventHash.STANDARD_EVENT_CREATED) {
        eventAddress = Utils.paddedHexToAddress(log.topics[2]);
      } else if (log.topics[0] === EventHash.CENTRALIZED_ORACLE_CREATED) {
        cOracleAddress = Utils.paddedHexToAddress(log.topics[2]);
      }
    });

    event = await StandardEvent.at(eventAddress);
    assert.isDefined(event);

    cOracle = await CentralizedOracle.at(cOracleAddress);
    assert.isDefined(cOracle);
  });

  afterEach(async () => {
    await timeMachine.revert();
  });

  describe('constructor', () => {
    const resultNames = ['Invalid', 'first', 'second', 'third'];
    const numOfResults = 4;

    it('initializes all the values', async () => {
      assert.equal(await event.owner.call(), OWNER);
      SolAssert.bytesStrEqual(await event.eventName.call(0), eventParams._name[0]);
      SolAssert.bytesStrEqual(await event.eventName.call(1), eventParams._name[1]);
      SolAssert.bytesStrEqual(await event.eventResults.call(0), RESULT_INVALID);
      SolAssert.bytesStrEqual(await event.eventResults.call(1), eventParams._resultNames[0]);
      SolAssert.bytesStrEqual(await event.eventResults.call(2), eventParams._resultNames[1]);
      SolAssert.bytesStrEqual(await event.eventResults.call(3), eventParams._resultNames[2]);
      assert.equal((await event.numOfResults.call()).toNumber(), numOfResults);
      SolAssert.assertBNEqual(await event.escrowAmount.call(), await addressManager.eventEscrowAmount.call());

      assert.equal(await cOracle.numOfResults.call(), numOfResults);
      assert.equal(await cOracle.oracle.call(), eventParams._oracle);
      SolAssert.assertBNEqual(await cOracle.bettingStartTime.call(), eventParams._bettingStartTime);
      SolAssert.assertBNEqual(await cOracle.bettingEndTime.call(), eventParams._bettingEndTime);
      SolAssert.assertBNEqual(await cOracle.resultSettingStartTime.call(), eventParams._resultSettingStartTime);
      SolAssert.assertBNEqual(await cOracle.resultSettingEndTime.call(), eventParams._resultSettingEndTime);
      SolAssert.assertBNEqual(
        await cOracle.consensusThreshold.call(),
        await addressManager.startingOracleThreshold.call(),
      );
    });

    it('can handle a long name using all 10 array slots', async () => {
      const name = ['abcdefghijklmnopqrstuvwxyzabcdef', 'abcdefghijklmnopqrstuvwxyzabcdef',
        'abcdefghijklmnopqrstuvwxyzabcdef', 'abcdefghijklmnopqrstuvwxyzabcdef',
        'abcdefghijklmnopqrstuvwxyzabcdef', 'abcdefghijklmnopqrstuvwxyzabcdef',
        'abcdefghijklmnopqrstuvwxyzabcdef', 'abcdefghijklmnopqrstuvwxyzabcdef',
        'abcdefghijklmnopqrstuvwxyzabcdef', 'abcdefghijklmnopqrstuvwxyzabcdef'];

      event = await StandardEvent.new(
        0, OWNER, eventParams._oracle, name, resultNames, numOfResults, eventParams._bettingStartTime,
        eventParams._bettingEndTime, eventParams._resultSettingStartTime, eventParams._resultSettingEndTime,
        addressManager.address,
      );

      SolAssert.bytesStrEqual(await event.eventName.call(0), name[0]);
      SolAssert.bytesStrEqual(await event.eventName.call(1), name[1]);
      SolAssert.bytesStrEqual(await event.eventName.call(2), name[2]);
      SolAssert.bytesStrEqual(await event.eventName.call(3), name[3]);
      SolAssert.bytesStrEqual(await event.eventName.call(4), name[4]);
      SolAssert.bytesStrEqual(await event.eventName.call(5), name[5]);
      SolAssert.bytesStrEqual(await event.eventName.call(6), name[6]);
      SolAssert.bytesStrEqual(await event.eventName.call(7), name[7]);
      SolAssert.bytesStrEqual(await event.eventName.call(8), name[8]);
      SolAssert.bytesStrEqual(await event.eventName.call(9), name[9]);
    });

    it('should only concatenate first 10 array slots of the name array', async () => {
      const name = ['abcdefghijklmnopqrstuvwxyzabcdef', 'abcdefghijklmnopqrstuvwxyzabcdef',
        'abcdefghijklmnopqrstuvwxyzabcdef', 'abcdefghijklmnopqrstuvwxyzabcdef',
        'abcdefghijklmnopqrstuvwxyzabcdef', 'abcdefghijklmnopqrstuvwxyzabcdef',
        'abcdefghijklmnopqrstuvwxyzabcdef', 'abcdefghijklmnopqrstuvwxyzabcdef',
        'abcdefghijklmnopqrstuvwxyzabcdef', 'abcdefghijklmnopqrstuvwxyzabcdef',
        'abcdefghijklmnopqrstuvwxyzabcdef'];
      event = await StandardEvent.new(
        0, OWNER, eventParams._oracle, name, resultNames, numOfResults, eventParams._bettingStartTime,
        eventParams._bettingEndTime, eventParams._resultSettingStartTime, eventParams._resultSettingEndTime,
        addressManager.address,
      );

      SolAssert.bytesStrEqual(await event.eventName.call(0), name[0]);
      SolAssert.bytesStrEqual(await event.eventName.call(1), name[1]);
      SolAssert.bytesStrEqual(await event.eventName.call(2), name[2]);
      SolAssert.bytesStrEqual(await event.eventName.call(3), name[3]);
      SolAssert.bytesStrEqual(await event.eventName.call(4), name[4]);
      SolAssert.bytesStrEqual(await event.eventName.call(5), name[5]);
      SolAssert.bytesStrEqual(await event.eventName.call(6), name[6]);
      SolAssert.bytesStrEqual(await event.eventName.call(7), name[7]);
      SolAssert.bytesStrEqual(await event.eventName.call(8), name[8]);
      SolAssert.bytesStrEqual(await event.eventName.call(9), name[9]);
    });

    it('should allow a space as the last character of a name array item', async () => {
      const name = ['abcdefghijklmnopqrstuvwxyzabcde ', 'fghijklmnopqrstuvwxyz'];
      event = await StandardEvent.new(
        0, OWNER, eventParams._oracle, name, resultNames, numOfResults, eventParams._bettingStartTime,
        eventParams._bettingEndTime, eventParams._resultSettingStartTime, eventParams._resultSettingEndTime,
        addressManager.address,
      );

      SolAssert.bytesStrEqual(await event.eventName.call(0), name[0]);
      SolAssert.bytesStrEqual(await event.eventName.call(1), name[1]);
    });

    it(
      'should allow a space as the first character if the next character is not empty in a name array item',
      async () => {
        const name = ['abcdefghijklmnopqrstuvwxyzabcdef', ' ghijklmnopqrstuvwxyz'];
        event = await StandardEvent.new(
          0, OWNER, eventParams._oracle, name, resultNames, numOfResults, eventParams._bettingStartTime,
          eventParams._bettingEndTime, eventParams._resultSettingStartTime, eventParams._resultSettingEndTime,
          addressManager.address,
        );

        SolAssert.bytesStrEqual(await event.eventName.call(0), name[0]);
        SolAssert.bytesStrEqual(await event.eventName.call(1), name[1]);
      },
    );

    it('can handle using all 11 results', async () => {
      const results = [RESULT_INVALID, 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth',
        'ninth', 'ten'];
      event = await StandardEvent.new(
        0, OWNER, eventParams._oracle, eventParams._name, results, 11,
        eventParams._bettingStartTime, eventParams._bettingEndTime,
        eventParams._resultSettingStartTime, eventParams._resultSettingEndTime,
        addressManager.address,
      );

      SolAssert.bytesStrEqual(await event.eventResults.call(0), results[0]);
      SolAssert.bytesStrEqual(await event.eventResults.call(1), results[1]);
      SolAssert.bytesStrEqual(await event.eventResults.call(2), results[2]);
      SolAssert.bytesStrEqual(await event.eventResults.call(3), results[3]);
      SolAssert.bytesStrEqual(await event.eventResults.call(4), results[4]);
      SolAssert.bytesStrEqual(await event.eventResults.call(5), results[5]);
      SolAssert.bytesStrEqual(await event.eventResults.call(6), results[6]);
      SolAssert.bytesStrEqual(await event.eventResults.call(7), results[7]);
      SolAssert.bytesStrEqual(await event.eventResults.call(8), results[8]);
      SolAssert.bytesStrEqual(await event.eventResults.call(9), results[9]);
      SolAssert.bytesStrEqual(await event.eventResults.call(10), results[10]);
    });

    it('should only set the first 10 results', async () => {
      const results = [RESULT_INVALID, 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth',
        'ninth', 'ten', 'eleven'];
      event = await StandardEvent.new(
        0, OWNER, eventParams._oracle, eventParams._name, results, 11,
        eventParams._bettingStartTime, eventParams._bettingEndTime,
        eventParams._resultSettingStartTime, eventParams._resultSettingEndTime,
        addressManager.address,
      );

      SolAssert.bytesStrEqual(await event.eventResults.call(0), results[0]);
      SolAssert.bytesStrEqual(await event.eventResults.call(1), results[1]);
      SolAssert.bytesStrEqual(await event.eventResults.call(2), results[2]);
      SolAssert.bytesStrEqual(await event.eventResults.call(3), results[3]);
      SolAssert.bytesStrEqual(await event.eventResults.call(4), results[4]);
      SolAssert.bytesStrEqual(await event.eventResults.call(5), results[5]);
      SolAssert.bytesStrEqual(await event.eventResults.call(6), results[6]);
      SolAssert.bytesStrEqual(await event.eventResults.call(7), results[7]);
      SolAssert.bytesStrEqual(await event.eventResults.call(8), results[8]);
      SolAssert.bytesStrEqual(await event.eventResults.call(9), results[9]);
      SolAssert.bytesStrEqual(await event.eventResults.call(10), results[10]);

      try {
        await event.eventResults.call(11);
        assert.fail();
      } catch (e) {
        SolAssert.assertInvalidOpcode(e);
      }
    });

    it('throws if owner address is invalid', async () => {
      try {
        await StandardEvent.new(
          0, 0, eventParams._oracle, eventParams._name, eventParams._resultNames, numOfResults,
          eventParams._bettingStartTime, eventParams._bettingEndTime,
          eventParams._resultSettingStartTime, eventParams._resultSettingEndTime,
          addressManager.address,
        );
        assert.fail();
      } catch (e) {
        SolAssert.assertRevert(e);
      }
    });

    it('throws if oracle address is invalid', async () => {
      try {
        await StandardEvent.new(
          0, OWNER, 0, eventParams._name, eventParams._resultNames, numOfResults, eventParams._bettingStartTime,
          eventParams._bettingEndTime, eventParams._resultSettingStartTime, eventParams._resultSettingEndTime,
          addressManager.address,
        );
        assert.fail();
      } catch (e) {
        SolAssert.assertRevert(e);
      }
    });

    it('throws if AddressManager address is invalid', async () => {
      try {
        await StandardEvent.new(
          0, OWNER, eventParams._centralizedOracle, eventParams._name, eventParams._resultNames, numOfResults,
          eventParams._bettingStartTime, eventParams._bettingEndTime, eventParams._resultSettingStartTime,
          eventParams._resultSettingEndTime, 0,
        );
        assert.fail();
      } catch (e) {
        SolAssert.assertRevert(e);
      }
    });

    it('throws if name is empty', async () => {
      try {
        await StandardEvent.new(
          0, OWNER, eventParams._centralizedOracle, [], eventParams._resultNames, numOfResults,
          eventParams._bettingStartTime, eventParams._bettingEndTime,
          eventParams._resultSettingStartTime, eventParams._resultSettingEndTime,
          addressManager.address,
        );
        assert.fail();
      } catch (e) {
        SolAssert.assertRevert(e);
      }
    });

    it('throws if eventResults 0 or 1 are empty', async () => {
      try {
        await StandardEvent.new(
          0, OWNER, eventParams._centralizedOracle, eventParams._name, [], 1,
          eventParams._bettingStartTime, eventParams._bettingEndTime,
          eventParams._resultSettingStartTime, eventParams._resultSettingEndTime,
          addressManager.address,
        );
        assert.fail();
      } catch (e) {
        SolAssert.assertRevert(e);
      }

      try {
        await StandardEvent.new(
          0, eventParams._owner, eventParams._centralizedOracle, eventParams._name,
          ['first'], 2, eventParams._bettingStartTime, eventParams._bettingEndTime,
          eventParams._resultSettingStartTime, eventParams._resultSettingEndTime,
          addressManager.address,
        );
        assert.fail();
      } catch (e) {
        SolAssert.assertRevert(e);
      }

      try {
        await StandardEvent.new(
          0, OWNER, eventParams._centralizedOracle, eventParams._name, ['', 'second'], 2,
          eventParams._bettingStartTime, eventParams._bettingEndTime,
          eventParams._resultSettingStartTime, eventParams._resultSettingEndTime,
          addressManager.address,
        );
        assert.fail();
      } catch (e) {
        SolAssert.assertRevert(e);
      }
    });

    it('throws if bettingEndTime is <= bettingStartTime', async () => {
      try {
        await StandardEvent.new(
          0, OWNER, eventParams._centralizedOracle, eventParams._name,
          eventParams._resultNames, numOfResults, eventParams._bettingStartTime, eventParams._bettingStartTime,
          eventParams._resultSettingStartTime, eventParams._resultSettingEndTime,
          addressManager.address,
        );
        assert.fail();
      } catch (e) {
        SolAssert.assertRevert(e);
      }
    });

    it('throws if resultSettingStartTime is < bettingEndTime', async () => {
      try {
        await StandardEvent.new(
          0, OWNER, eventParams._centralizedOracle, eventParams._name,
          eventParams._resultNames, numOfResults, eventParams._bettingStartTime, eventParams._bettingEndTime,
          eventParams._bettingEndTime - 1, eventParams._resultSettingEndTime, addressManager.address,
        );
        assert.fail();
      } catch (e) {
        SolAssert.assertRevert(e);
      }
    });

    it('throws if resultSettingEndTime is <= resultSettingStartTime', async () => {
      try {
        await StandardEvent.new(
          0, OWNER, eventParams._centralizedOracle, eventParams._name,
          eventParams._resultNames, numOfResults, eventParams._bettingStartTime, eventParams._bettingEndTime,
          eventParams._resultSettingStartTime, eventParams._resultSettingStartTime, addressManager.address,
        );
        assert.fail();
      } catch (e) {
        SolAssert.assertRevert(e);
      }
    });
  });

  describe('fallback function', () => {
    it('throws upon calling', async () => {
      try {
        await bluebird.promisify(web3.eth.sendTransaction)({
          to: event.address,
          from: OWNER,
          value: 1,
        });
        assert.fail();
      } catch (e) {
        SolAssert.assertRevert(e);
      }
    });
  });

  describe('tokenFallback()', () => {
    describe('setResult()', () => {
      let threshold;

      beforeEach(async () => {
        threshold = await cOracle.consensusThreshold.call();

        // Advance to result setting start time
        await timeMachine.increaseTime(eventParams._resultSettingStartTime - Utils.currentBlockTime());
        assert.isAtLeast(Utils.currentBlockTime(), eventParams._resultSettingStartTime);
        assert.isBelow(Utils.currentBlockTime(), eventParams._resultSettingEndTime);
      });

      it('calls setResult() correctly', async () => {
        // Call ERC223 transfer method
        const resultIndex = 3;
        const tx = await ContractHelper.transferSetResult(token, event, cOracle, OWNER, resultIndex, threshold, OWNER);
        
        // Validate event
        assert.equal(await event.status.call(), EventStatus.ORACLE_VOTING);
        assert.equal(await event.resultIndex.call(), resultIndex);
        SolAssert.assertBNEqual((await event.getTotalVotes())[resultIndex], threshold);
        SolAssert.assertBNEqual((await event.getVoteBalances({ from: OWNER }))[resultIndex], threshold);
        SolAssert.assertBNEqual(await event.totalArbitrationTokens.call(), threshold);

        // Validate cOracle
        assert.isTrue(await cOracle.finished.call());
        assert.equal(await cOracle.resultIndex.call(), resultIndex);
        SolAssert.assertBNEqual((await cOracle.getTotalVotes())[resultIndex], threshold);
        SolAssert.assertBNEqual((await cOracle.getVoteBalances({ from: OWNER }))[resultIndex], threshold);

        // Validate dOracle created
        const dOracleAddress = Utils.paddedHexToAddress(tx.events['2'].raw.topics[2]);
        const dOracle = await DecentralizedOracle.at(dOracleAddress);
        assert.equal(await dOracle.eventAddress.call(), event.address);
        assert.equal(await dOracle.lastResultIndex.call(), resultIndex);
        SolAssert.assertBNEqual(await dOracle.consensusThreshold.call(),
          Utils.percentIncrease(threshold, thresholdIncrease));
      });

      it('throws if the data length is not 76 bytes', async () => {
        const resultIndex = 3;
        let data = '0x65f4ced1'
          + Qweb3Utils.trimHexPrefix(cOracle.address)
          + Qweb3Utils.trimHexPrefix(OWNER)
          + Encoder.uintToHex(resultIndex);
        assert.equal(data.length, 154);
        data = data.slice(0, 152);
        assert.equal(data.length, 152);

        try {
          await tokenWeb3Contract.methods["transfer(address,uint256,bytes)"](event.address, threshold, data)
            .send({ from: OWNER, gas: 5000000 });
          assert.fail();
        } catch (e) {
          SolAssert.assertRevert(e);
        }
      });

      it('throws if the event status is not betting', async () => {
        // Call ERC223 transfer method
        let resultIndex = 3;
        await ContractHelper.transferSetResult(token, event, cOracle, OWNER, resultIndex, threshold, OWNER);
        assert.equal(await event.status.call(), EventStatus.ORACLE_VOTING);

        // Try to set the result again
        try {
          await ContractHelper.transferSetResult(token, event, cOracle, OWNER, resultIndex, threshold, OWNER);
          assert.fail();
        } catch (e) {
          SolAssert.assertRevert(e);
        }
      });
    });

    describe('vote()', () => {
      let dOracle;

      beforeEach(async () => {
        const threshold = await cOracle.consensusThreshold.call();

        // Advance to result setting start time
        await timeMachine.increaseTime(eventParams._resultSettingStartTime - Utils.currentBlockTime());
        assert.isAtLeast(Utils.currentBlockTime(), eventParams._resultSettingStartTime);
        assert.isBelow(Utils.currentBlockTime(), eventParams._resultSettingEndTime);

        // Set the result
        const setResultIndex = 3;
        const tx = await ContractHelper.transferSetResult(token, event, cOracle, OWNER, setResultIndex, threshold,
          OWNER);

        // Get dOracle
        const dOracleAddress = Utils.paddedHexToAddress(tx.events['2'].raw.topics[2]);
        dOracle = await DecentralizedOracle.at(dOracleAddress);
        assert.equal(await dOracle.lastResultIndex.call(), setResultIndex);
      });

      it('calls vote() correctly and sets the result when hitting the threshold', async () => {
        // Vote
        const threshold = await dOracle.consensusThreshold.call();
        const voteIndex = 1;
        const tx = await ContractHelper.transferVote(token, event, dOracle, ACCT1, voteIndex, threshold);

        // Validate event
        assert.equal(await event.status.call(), EventStatus.ORACLE_VOTING);
        assert.equal(await event.resultIndex.call(), voteIndex);

        // Validate dOracle1
        SolAssert.assertBNEqual((await dOracle.getTotalVotes())[voteIndex], threshold);
        SolAssert.assertBNEqual((await dOracle.getVoteBalances({ from: ACCT1 }))[voteIndex], threshold);
        assert.isTrue(await dOracle.finished.call());
        assert.equal(await dOracle.resultIndex.call(), voteIndex);

        // Validate dOracle2
        const dOracle2Address = Utils.paddedHexToAddress(tx.events['2'].raw.topics[2]);
        const dOracle2 = await DecentralizedOracle.at(dOracle2Address);
        assert.equal(await dOracle2.lastResultIndex.call(), voteIndex);
        SolAssert.assertBNEqual(await dOracle2.consensusThreshold.call(),
          Utils.percentIncrease(threshold, thresholdIncrease));
      });

      it('throws if the data length is not 76 bytes', async () => {
        const voteAmount = Utils.toDenomination(50, tokenDecimals);
        const voteIndex = 1;
        let data = '0x6f02d1fb'
          + Qweb3Utils.trimHexPrefix(dOracle.address)
          + Qweb3Utils.trimHexPrefix(ACCT1)
          + Encoder.uintToHex(voteIndex);
        assert.equal(data.length, 154);
        data = data.slice(0, 152);
        assert.equal(data.length, 152);

        try {
          await tokenWeb3Contract.methods["transfer(address,uint256,bytes)"](event.address, voteAmount, data)
            .send({ from: ACCT1, gas: 5000000 });
          assert.fail();
        } catch (e) {
          SolAssert.assertRevert(e);
        }
      });
    });

    it('throws if trying to call an unhandled function', async () => {
      try {
        await tokenWeb3Contract.methods["transfer(address,uint256,bytes)"](
          event.address,
          Utils.toDenomination(1, tokenDecimals),
          '0xabcdef01'
        ).send({ from: OWNER, gas: 5000000 });
        assert.fail();
      } catch (e) {
        SolAssert.assertRevert(e);
      }
    });
  });

  describe('bet()', () => {
    beforeEach(async () => {
      await timeMachine.increaseTime(eventParams._bettingStartTime - Utils.currentBlockTime());
      assert.isAtLeast(Utils.currentBlockTime(), eventParams._bettingStartTime);
      assert.isBelow(Utils.currentBlockTime(), eventParams._bettingEndTime);
    });

    it('allows users to bet', async () => {
      const betAmount = Utils.toDenomination(1, BET_TOKEN_DECIMALS);
      const betResultIndex = 0;
      await event.bet(cOracle.address, betResultIndex, { from: ACCT1, value: betAmount });

      SolAssert.assertBNEqual((await event.getTotalBets())[betResultIndex], betAmount);
      const betBalances = await event.getBetBalances({ from: ACCT1 });
      SolAssert.assertBNEqual(betBalances[betResultIndex], betAmount);
      SolAssert.assertBNEqual(await event.totalBetTokens.call(), betAmount);
    });
  });

  describe('finalizeResult()', () => {
    const cOracleResult = 1;
    let dOracle;

    beforeEach(async () => {
      // Advance to result setting time
      await timeMachine.increaseTime(eventParams._resultSettingStartTime - Utils.currentBlockTime());
      assert.isAtLeast(Utils.currentBlockTime(), eventParams._resultSettingStartTime);
      assert.isBelow(Utils.currentBlockTime(), eventParams._resultSettingEndTime);

      // Set the result
      const threshold = await cOracle.consensusThreshold.call();
      const tx = await ContractHelper.transferSetResult(token, event, cOracle, OWNER, cOracleResult, threshold, OWNER);
      const dOracleAddress = Utils.paddedHexToAddress(tx.events['2'].raw.topics[2]);
      dOracle = await DecentralizedOracle.at(dOracleAddress);

      // Advance to arbitrationEndTime
      const arbitrationEndTime = (await dOracle.arbitrationEndTime.call()).toNumber();
      await timeMachine.increaseTime(arbitrationEndTime - Utils.currentBlockTime());
      assert.isAtLeast(Utils.currentBlockTime(), arbitrationEndTime);

      // Finalize
      assert.equal(await event.status.call(), EventStatus.ORACLE_VOTING);
      await event.finalizeResult(dOracle.address, { from: ACCT1 });
      assert.equal(await event.status.call(), EventStatus.COLLECTION);
    });

    it('finalizes the result', async () => {
      const finalResult = await event.getFinalResult();
      assert.equal(finalResult[0], cOracleResult);
      assert.isTrue(finalResult[1]);
    });

    it('throws if the current status is not Status.OracleVoting', async () => {
      try {
        await event.finalizeResult(dOracle.address, { from: ACCT1 });
        assert.fail();
      } catch (e) {
        SolAssert.assertRevert(e);
      }
    });
  });

  describe('withdrawWinnings()', () => {
    const cOracleResult = 2;
    const dOracle1Result = 1;
    const dOracle2Result = 2;
    let bet1, bet2, bet3, bet4;
    let totalBetBalance;
    let cOracleThreshold;
    let dOracle;

    beforeEach(async () => {
      // Advance to betting time
      await timeMachine.increaseTime(eventParams._bettingStartTime - Utils.currentBlockTime());
      assert.isAtLeast(Utils.currentBlockTime(), eventParams._bettingStartTime);
      assert.isBelow(Utils.currentBlockTime(), eventParams._bettingEndTime);

      // First round of betting
      bet1 = Utils.toDenomination(7777777777);
      await event.bet(cOracle.address, 0, { from: ACCT1, value: bet1 });
      totalBetBalance = bet1;
      assert.equal(await web3.eth.getBalance(event.address), totalBetBalance);
      SolAssert.assertBNEqual((await event.getBetBalances({ from: ACCT1 }))[0], bet1);

      bet2 = Utils.toDenomination(2212345678);
      await event.bet(cOracle.address, 1, { from: ACCT2, value: bet2 });
      totalBetBalance = bet1.add(bet2);
      assert.equal(await web3.eth.getBalance(event.address), totalBetBalance);
      SolAssert.assertBNEqual((await event.getBetBalances({ from: ACCT2 }))[1], bet2);

      bet3 = Utils.toDenomination(3027596457);
      await event.bet(cOracle.address, cOracleResult, { from: ACCT3, value: bet3 });
      totalBetBalance = bet1.add(bet2).add(bet3);
      assert.equal(await web3.eth.getBalance(event.address), totalBetBalance);
      SolAssert.assertBNEqual((await event.getBetBalances({ from: ACCT3 }))[cOracleResult], bet3);

      bet4 = Utils.toDenomination(1298765432);
      await event.bet(cOracle.address, cOracleResult, { from: ACCT4, value: bet4 });
      totalBetBalance = bet1.add(bet2).add(bet3).add(bet4);
      assert.equal(await web3.eth.getBalance(event.address), totalBetBalance);
      SolAssert.assertBNEqual((await event.getBetBalances({ from: ACCT4 }))[cOracleResult], bet4);

      SolAssert.assertBNEqual(await event.totalBetTokens.call(), totalBetBalance);

      // Advance time to result setting time
      await timeMachine.increaseTime(eventParams._resultSettingStartTime - Utils.currentBlockTime());
      assert.isAtLeast(Utils.currentBlockTime(), eventParams._resultSettingStartTime);
      assert.isBelow(Utils.currentBlockTime(), eventParams._resultSettingEndTime);
      
      // cOracle set result 2
      cOracleThreshold = await cOracle.consensusThreshold.call();
      const tx = await ContractHelper.transferSetResult(token, event, cOracle, OWNER, cOracleResult, cOracleThreshold);
      const dOracleAddress = Utils.paddedHexToAddress(tx.events['2'].raw.topics[2]);
      dOracle = await DecentralizedOracle.at(dOracleAddress);
    });

    it('transfers the tokens for a multiple betting/voting rounds', async () => {
      // dOracle1 voting hits consensusThreshold
      const vote1a = Utils.toDenomination(61.12345678, tokenDecimals);
      await ContractHelper.transferVote(token, event, dOracle, ACCT1, dOracle1Result, vote1a);
      SolAssert.assertBNEqual((await event.getVoteBalances({ from: ACCT1 }))[dOracle1Result], vote1a);

      const vote2 = Utils.toDenomination(48.87654322, tokenDecimals);
      let tx = await ContractHelper.transferVote(token, event, dOracle, ACCT2, dOracle1Result, vote2);
      SolAssert.assertBNEqual((await event.getVoteBalances({ from: ACCT2 }))[dOracle1Result], vote2);

      let totalVoteBalance = cOracleThreshold.add(vote1a).add(vote2);
      let totalArbitrationTokens = await event.totalArbitrationTokens.call();
      SolAssert.assertBNEqual(await token.balanceOf(event.address), totalArbitrationTokens);

      // Get dOracle2 instance
      const dOracle2Address = Utils.paddedHexToAddress(tx.events['2'].raw.topics[2]);
      const dOracle2 = await DecentralizedOracle.at(dOracle2Address);
      
      // DecentralizedOracle2 voting hits consensusThreshold
      const vote3 = Utils.toDenomination(73.73737373, tokenDecimals);
      await ContractHelper.transferVote(token, event, dOracle2, ACCT3, dOracle2Result, vote3);
      SolAssert.assertBNEqual((await event.getVoteBalances({ from: ACCT3 }))[dOracle2Result], vote3);

      const vote4 = Utils.toDenomination(47.26262627, tokenDecimals);
      tx = await ContractHelper.transferVote(token, event, dOracle2, ACCT4, dOracle2Result, vote4);
      SolAssert.assertBNEqual((await event.getVoteBalances({ from: ACCT4 }))[dOracle2Result], vote4);

      // Get dOracle3 instance
      const dOracle3Address = Utils.paddedHexToAddress(tx.events['2'].raw.topics[2]);
      const dOracle3 = await DecentralizedOracle.at(dOracle3Address);

      totalVoteBalance = totalVoteBalance.add(vote3).add(vote4);
      totalArbitrationTokens = await event.totalArbitrationTokens.call();
      SolAssert.assertBNEqual(totalArbitrationTokens, totalVoteBalance);
      SolAssert.assertBNEqual(await token.balanceOf(event.address), totalArbitrationTokens);

      // dOracle3 voting under consensusThreshold
      const vote1b = Utils.toDenomination(71.35713713, tokenDecimals);
      await ContractHelper.transferVote(token, event, dOracle3, ACCT1, dOracle1Result, vote1b);
      SolAssert.assertBNEqual((await event.getVoteBalances({ from: ACCT1 }))[dOracle1Result], vote1a.add(vote1b));

      // Advance to arbitrationEndTime
      const arbitrationEndTime = (await dOracle3.arbitrationEndTime.call()).toNumber();
      await timeMachine.increaseTime(arbitrationEndTime - Utils.currentBlockTime());
      assert.isAtLeast(Utils.currentBlockTime(), arbitrationEndTime);
      
      // DecentralizedOracle finalize result
      await event.finalizeResult(dOracle3.address, { from: ACCT1 });
      assert.equal(await event.status.call(), EventStatus.COLLECTION);
      const finalResult = await event.getFinalResult();
      assert.equal(finalResult[0], dOracle2Result);
      assert.isTrue(finalResult[1]);

      const expectedTotalBetTokens = bet1.add(bet2).add(bet3).add(bet4);
      SolAssert.assertBNEqual(await event.totalBetTokens.call(), expectedTotalBetTokens);
      const expectedTotalArbitrationTokens = cOracleThreshold.add(vote1a).add(vote1b).add(vote2).add(vote3).add(vote4);
      SolAssert.assertBNEqual(await event.totalArbitrationTokens.call(), expectedTotalArbitrationTokens);

      // ACCT3 winner withdraw
      let winningsArr = await event.calculateWinnings({ from: ACCT3 });
      let arbTokensWon = winningsArr[0];
      let betTokensWon = winningsArr[1];

      let expectedBetTokens = Utils.toDenomination(await web3.eth.getBalance(event.address)).sub(betTokensWon);
      let expectedArbTokens = (await token.balanceOf(event.address)).sub(arbTokensWon);
      assert.isFalse(await event.didWithdraw.call(ACCT3));
      await event.withdrawWinnings({ from: ACCT3 });
      SolAssert.assertBNEqual(await web3.eth.getBalance(event.address), expectedBetTokens);
      SolAssert.assertBNEqual(await token.balanceOf(event.address), expectedArbTokens);
      assert.isTrue(await event.didWithdraw.call(ACCT3));

      // ACCT4 winner withdraw
      winningsArr = await event.calculateWinnings({ from: ACCT4 });
      arbTokensWon = winningsArr[0];
      betTokensWon = winningsArr[1];

      expectedBetTokens = Utils.toDenomination(await web3.eth.getBalance(event.address)).sub(betTokensWon);
      expectedArbTokens = (await token.balanceOf(event.address)).sub(arbTokensWon);
      assert.isFalse(await event.didWithdraw.call(ACCT4));
      await event.withdrawWinnings({ from: ACCT4 });
      SolAssert.assertBNEqual(await web3.eth.getBalance(event.address), expectedBetTokens);
      SolAssert.assertBNEqual(await token.balanceOf(event.address), expectedArbTokens);
      assert.isTrue(await event.didWithdraw.call(ACCT4));

      // OWNER winner withdraw
      winningsArr = await event.calculateWinnings({ from: OWNER });
      arbTokensWon = winningsArr[0];
      betTokensWon = winningsArr[1];

      expectedBetTokens = Utils.toDenomination(await web3.eth.getBalance(event.address)).sub(betTokensWon);
      expectedArbTokens = (await token.balanceOf(event.address)).sub(arbTokensWon);
      assert.isFalse(await event.didWithdraw.call(OWNER));
      await event.withdrawWinnings({ from: OWNER });
      SolAssert.assertBNEqual(await web3.eth.getBalance(event.address), expectedBetTokens);
      SolAssert.assertBNEqual(await token.balanceOf(event.address), expectedArbTokens);
      assert.isTrue(await event.didWithdraw.call(OWNER));

      // ACCT1 loser withdraw
      winningsArr = await event.calculateWinnings({ from: ACCT1 });
      arbTokensWon = winningsArr[0];
      betTokensWon = winningsArr[1];

      assert.equal(arbTokensWon, 0);
      assert.equal(betTokensWon, 0);
      assert.isFalse(await event.didWithdraw.call(ACCT1));
      await event.withdrawWinnings({ from: ACCT1 });
      assert.isTrue(await event.didWithdraw.call(ACCT1));

      // ACCT2 loser withdraw
      winningsArr = await event.calculateWinnings({ from: ACCT2 });
      arbTokensWon = winningsArr[0];
      betTokensWon = winningsArr[1];

      assert.equal(arbTokensWon, 0);
      assert.equal(betTokensWon, 0);
      assert.isFalse(await event.didWithdraw.call(ACCT2));
      await event.withdrawWinnings({ from: ACCT2 });
      assert.isTrue(await event.didWithdraw.call(ACCT2));
    });

    it('throws if status is not Status.Collection', async () => {
      assert.notEqual(await event.status.call(), EventStatus.COLLECTION);
      try {
        await event.withdrawWinnings({ from: OWNER });
        assert.fail();
      } catch (e) {
        SolAssert.assertRevert(e);
      }
    });

    it('throws if already withdrawn', async () => {
      // Advance to arbitrationEndTime
      const arbitrationEndTime = (await dOracle.arbitrationEndTime.call()).toNumber();
      await timeMachine.increaseTime(arbitrationEndTime - Utils.currentBlockTime());
      assert.isAtLeast(Utils.currentBlockTime(), arbitrationEndTime);
      
      // dOracle finalize result
      await event.finalizeResult(dOracle.address, { from: ACCT1 });
      assert.equal(await event.status.call(), EventStatus.COLLECTION);
      const finalResult = await event.getFinalResult();
      assert.equal(finalResult[0], cOracleResult);
      assert.isTrue(finalResult[1]);

      // Winner withdraw
      await event.withdrawWinnings({ from: ACCT3 });
      assert.isTrue(await event.didWithdraw.call(ACCT3));

      try {
        await event.withdrawWinnings({ from: ACCT3 });
        assert.fail();
      } catch (e) {
        SolAssert.assertRevert(e);
      }

      // Loser withdraw
      await event.withdrawWinnings({ from: ACCT1 });
      assert.isTrue(await event.didWithdraw.call(ACCT1));

      try {
        await event.withdrawWinnings({ from: ACCT1 });
        assert.fail();
      } catch (e) {
        SolAssert.assertRevert(e);
      }
    });
  });
});
