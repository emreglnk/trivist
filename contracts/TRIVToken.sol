// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract TRIVToken is ERC20, Ownable {
    uint256 public constant DAILY_CLAIM_AMOUNT = 50 * 10**18; // 50 TRIV
    uint256 public constant GAME_ENTRY_COST = 25 * 10**18; // 25 TRIV
    uint256 public constant QUESTION_REWARD = 1 * 10**18; // 1 TRIV per correct answer
    
    mapping(address => uint256) public lastClaimTime;
    mapping(address => uint256) public gamesPlayed;
    mapping(address => uint256) public questionsAnswered;
    
    event TokensClaimed(address indexed user, uint256 amount);
    event GameEntered(address indexed user, uint256 cost);
    event QuestionRewarded(address indexed user, uint256 reward);
    
    constructor() ERC20("Trivia Token", "TRIV") Ownable(msg.sender) {
        // Mint initial supply to owner for distribution
        _mint(msg.sender, 1000000 * 10**18); // 1M TRIV
    }
    
    function claimDailyTokens() external {
        require(
            block.timestamp >= lastClaimTime[msg.sender] + 1 days,
            "Daily claim not available yet"
        );
        
        lastClaimTime[msg.sender] = block.timestamp;
        _mint(msg.sender, DAILY_CLAIM_AMOUNT);
        
        emit TokensClaimed(msg.sender, DAILY_CLAIM_AMOUNT);
    }
    
    function canClaimDaily(address user) external view returns (bool) {
        return block.timestamp >= lastClaimTime[user] + 1 days;
    }
    
    function getTimeUntilNextClaim(address user) external view returns (uint256) {
        uint256 nextClaimTime = lastClaimTime[user] + 1 days;
        if (block.timestamp >= nextClaimTime) {
            return 0;
        }
        return nextClaimTime - block.timestamp;
    }
    
    function enterGame() external {
        require(balanceOf(msg.sender) >= GAME_ENTRY_COST, "Insufficient TRIV tokens");
        
        _burn(msg.sender, GAME_ENTRY_COST);
        gamesPlayed[msg.sender]++;
        
        emit GameEntered(msg.sender, GAME_ENTRY_COST);
    }
    
    function rewardCorrectAnswer(address user) external onlyOwner {
        _mint(user, QUESTION_REWARD);
        questionsAnswered[user]++;
        
        emit QuestionRewarded(user, QUESTION_REWARD);
    }
    
    function getUserStats(address user) external view returns (
        uint256 balance,
        uint256 games,
        uint256 questions,
        bool canClaim,
        uint256 timeUntilClaim
    ) {
        balance = balanceOf(user);
        games = gamesPlayed[user];
        questions = questionsAnswered[user];
        canClaim = block.timestamp >= lastClaimTime[user] + 1 days;
        
        uint256 nextClaimTime = lastClaimTime[user] + 1 days;
        timeUntilClaim = block.timestamp >= nextClaimTime ? 0 : nextClaimTime - block.timestamp;
    }
}
