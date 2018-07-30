const web3 = global.web3;

module.exports = class Utils {
  // Converts the amount to a big number given the number of decimals
  static getBigNumberWithDecimals(amount, numOfDecimals) {
    return web3.toBigNumber(amount * (10 ** numOfDecimals));
  }

  /*
  * Returns the original value increased by a percentage.
  * @param bigNumber {BigNumber} The BigNumber to increase.
  * @param percentage {BigNumber} The percent amount to increase the number by.
  * @retun {BigNumber} The increased BigNumber by the percentage.
  */
  static percentIncrease(bigNumber, percentage) {
    return bigNumber.times(web3.toBigNumber(percentage)).div(web3.toBigNumber(100)).plus(bigNumber);
  }

  // Gets the unix time in seconds of the current block
  static getCurrentBlockTime() {
    return web3.eth.getBlock(web3.eth.blockNumber).timestamp;
  }

  /*
  * Removes the padded zeros in an address hex string.
  * eg. 0x0000000000000000000000006b36fdf89d706035dc97b6aa4bc84b2418a452f1 -> 0x6b36fdf89d706035dc97b6aa4bc84b2418a452f1
  * @param hexString {string} The hex string to remove the padding from.
  * @return {string} The hex string with the padded zeros removed.
  */
  static paddedHexToAddress(hexString) {
    const regex = new RegExp(/(0x)(0+)([a-fA-F0-9]{40})/);
    const matches = regex.exec(hexString);
    return matches && matches[1] + matches[3];
  }
};