// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/IPancakeV2Router02.sol";

contract ChaosEngine {
    enum EventType { VOLATILITY_SPIKE, LIQUIDITY_DRAIN, FAKE_PUMP, FAKE_DUMP, CALM }
    enum ActionType { HOLD, SWAP_WBNB_TO_USD, SWAP_USD_TO_WBNB }

    event Funded(address indexed from, address indexed token, uint256 amount);
    event ChaosTriggered(uint256 indexed roundId, EventType eventType, uint256 severity, address indexed trigger);
    event DecisionMade(
        uint256 indexed roundId,
        ActionType actionType,
        uint256 riskScore,
        uint256 tradeBps,
        uint256 confidence,
        bytes32 metadataHash
    );
    event SwapExecuted(
        uint256 indexed roundId,
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        bytes32 txTag
    );

    address public owner;
    address public executor;

    IPancakeV2Router02 public router;
    IERC20 public wbnb;
    IERC20 public usd;

    uint256 public roundId;
    uint256 public triggerFeeWei;

    struct ChaosState {
        EventType eventType;
        uint256 severity;
        uint256 timestamp;
        address trigger;
    }

    mapping(uint256 => ChaosState) public chaosByRound;

    modifier onlyOwner() {
        require(msg.sender == owner, "ONLY_OWNER");
        _;
    }

    modifier onlyExecutor() {
        require(msg.sender == executor, "ONLY_EXECUTOR");
        _;
    }

    constructor(address router_, address wbnb_, address usd_, address executor_, uint256 triggerFeeWei_) {
        owner = msg.sender;
        executor = executor_;
        router = IPancakeV2Router02(router_);
        wbnb = IERC20(wbnb_);
        usd = IERC20(usd_);
        triggerFeeWei = triggerFeeWei_;
    }

    function setExecutor(address newExecutor) external onlyOwner {
        executor = newExecutor;
    }

    function setTriggerFee(uint256 newFeeWei) external onlyOwner {
        triggerFeeWei = newFeeWei;
    }

    function fundToken(address token, uint256 amount) external {
        require(amount > 0, "AMOUNT_0");
        IERC20(token).transferFrom(msg.sender, address(this), amount);
        emit Funded(msg.sender, token, amount);
    }

    function triggerChaos(uint256 userSeed) external payable returns (uint256) {
        require(msg.value >= triggerFeeWei, "FEE_TOO_LOW");

        roundId += 1;

        uint256 r = uint256(keccak256(abi.encodePacked(block.timestamp, block.prevrandao, msg.sender, userSeed, roundId)));
        EventType e = EventType(r % 5);
        uint256 severity = 1 + (r % 100);

        chaosByRound[roundId] = ChaosState({
            eventType: e,
            severity: severity,
            timestamp: block.timestamp,
            trigger: msg.sender
        });

        emit ChaosTriggered(roundId, e, severity, msg.sender);
        return roundId;
    }

    function getBalances() external view returns (uint256 wbnbBal, uint256 usdBal) {
        wbnbBal = wbnb.balanceOf(address(this));
        usdBal = usd.balanceOf(address(this));
    }

    function decideAndExecute(
        uint256 targetRoundId,
        ActionType actionType,
        uint256 riskScore,
        uint256 tradeBps,
        uint256 confidence,
        uint256 amountOutMin,
        uint256 deadline,
        bytes32 metadataHash,
        bytes32 txTag
    ) external onlyExecutor {
        require(targetRoundId > 0 && targetRoundId <= roundId, "BAD_ROUND");
        require(tradeBps <= 5000, "TRADE_TOO_BIG");
        require(deadline >= block.timestamp, "BAD_DEADLINE");

        emit DecisionMade(targetRoundId, actionType, riskScore, tradeBps, confidence, metadataHash);

        if (actionType == ActionType.HOLD || tradeBps == 0) {
            return;
        }

        if (actionType == ActionType.SWAP_WBNB_TO_USD) {
            _swap(address(wbnb), address(usd), tradeBps, amountOutMin, deadline, targetRoundId, txTag);
        } else if (actionType == ActionType.SWAP_USD_TO_WBNB) {
            _swap(address(usd), address(wbnb), tradeBps, amountOutMin, deadline, targetRoundId, txTag);
        }
    }

    function _swap(
        address tokenIn,
        address tokenOut,
        uint256 tradeBps,
        uint256 amountOutMin,
        uint256 deadline,
        uint256 targetRoundId,
        bytes32 txTag
    ) internal {
        uint256 bal = IERC20(tokenIn).balanceOf(address(this));
        require(bal > 0, "NO_BALANCE");

        uint256 amountIn = (bal * tradeBps) / 10000;
        require(amountIn > 0, "AMOUNT_IN_0");

        IERC20(tokenIn).approve(address(router), 0);
        IERC20(tokenIn).approve(address(router), amountIn);

        address[] memory path = new address[](2);
        path[0] = tokenIn;
        path[1] = tokenOut;

        uint[] memory amounts = router.swapExactTokensForTokens(amountIn, amountOutMin, path, address(this), deadline);

        emit SwapExecuted(targetRoundId, tokenIn, tokenOut, amountIn, amounts[1], txTag);
    }

    function withdrawBNB(address payable to, uint256 amount) external onlyOwner {
        require(to != address(0), "BAD_TO");
        to.transfer(amount);
    }

    receive() external payable {}
}
