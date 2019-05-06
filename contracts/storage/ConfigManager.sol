pragma solidity ^0.5.8;

import "./IConfigManager.sol";
import "../lib/Ownable.sol";

contract ConfigManager is IAddressManager, Ownable {
    uint256 private constant TOKEN_DECIMALS = 8;

    uint8 private _arbitrationRewardPercentage = 1;
    address private _eventFactoryAddress;
    uint256 private _eventEscrowAmount = 100 * (10 ** TOKEN_DECIMALS);
    uint256 private _arbitrationLength = 24 * 60 * 60; // 1 day
    uint256 private _startingOracleThreshold = 100 * (10 ** TOKEN_DECIMALS);
    uint256 private _thresholdPercentIncrease = 10;
    mapping(address => bool) private _whitelistedContracts;

    // Events
    event EventFactoryChanged(address indexed oldAddress, address indexed newAddress);
    event ContractWhitelisted(address indexed contractAddress);

    // Modifiers
    modifier isWhitelisted(address _contractAddress) {
        require(whitelistedContracts[_contractAddress] == true);
        _;
    }

    constructor() Ownable(msg.sender) public {
    }

    /// @dev Adds a whitelisted contract address. Only allowed to be called from previously whitelisted addresses.
    /// @param contractAddress The address of the contract to whitelist.
    function addWhitelistContract(
        address contractAddress)
        external
        onlyOwner
        isWhitelisted(msg.sender)
        validAddress(contractAddress)
    {
        _whitelistedContracts[contractAddress] = true;

        emit ContractWhitelisted(contractAddress);
    }

    /// @dev Allows the owner to set the address of an EventFactory contract.
    /// @param contractAddress The address of the EventFactory contract.
    function setEventFactory(
        address contractAddress)
        external
        onlyOwner
        validAddress(contractAddress) 
    {
        address oldAddress = _eventFactoryAddress;
        _eventFactoryAddress = contractAddress;
        _whitelistedContracts[contractAddress] = true;

        emit EventFactoryChanged(oldAddress, _eventFactoryAddress);
        emit ContractWhitelisted(contractAddress);
    }

    /// @dev Sets the escrow amount that is needed to create an Event.
    /// @param newAmount The new escrow amount needed to create an Event.
    function setEventEscrowAmount(
        uint256 newAmount)
        external
        onlyOwner
    {
        _eventEscrowAmount = newAmount;
    }

    /// @dev Sets the arbitration length.
    /// @param newLength The new length in seconds (unix time) of an arbitration period.
    function setArbitrationLength(
        uint256 newLength)
        external
        onlyOwner
    {   
        require(newLength > 0);
        _arbitrationLength = newLength;
    }

    /// @dev Sets the arbitration reward percentage.
    /// @param newPercentage New percentage of the arbitration participation reward (e.g. 5)
    function setArbitrationRewardPercentage(
        uint256 newPercentage)
        external
        onlyOwner
    {
        _arbitrationRewardPercentage = newPercentage;
    }

    /// @dev Sets the starting betting threshold.
    /// @param newThreshold The new consensus threshold for the betting round.
    function setStartingOracleThreshold(
        uint256 newThreshold)
        external
        onlyOwner
    {
        _startingOracleThreshold = newThreshold;
    }

    /// @dev Sets the threshold percentage increase.
    /// @param newPercentage The new percentage increase for each new round.
    function setConsensusThresholdPercentIncrease(
        uint256 newPercentage)
        external
        onlyOwner
    {
        _thresholdPercentIncrease = newPercentage;
    }

    function eventEscrowAmount() external view returns (uint256) {
        return _eventEscrowAmount;
    }

    function arbitrationLength() external view returns (uint256) {
        return _arbitrationLength;
    }

    function arbitrationRewardPercentage() external view returns (uint8) {
        return _arbitrationRewardPercentage;
    }

    function startingOracleThreshold() external view returns (uint256) {
        return _startingOracleThreshold;
    }

    function thresholdPercentIncrease() external view returns (uint256) {
        return _thresholdPercentIncrease;
    }
}
