export const VERIFIED_EXECUTION = {
  network: "Ethereum Sepolia",
  chainId: 11155111,
  status: "confirmed",
  amount: "0.00001 ETH",
  amountWei: "10000000000000",
  blockNumber: 11379904,
  executedAt: "2026-07-30T03:36:24.000Z",
  from: "0x13f7d10b4931d0d5845824dfc0189360f59c1fd6",
  to: "0x1c19A9afa995B096Ea029723DF3C2AfA33c2957C",
  transactionHash:
    "0x610782610a42209ff816965eb618e8ec6c5d254f9f763f04f11b19da0cc46b3b",
  transactionLink:
    "https://sepolia.etherscan.io/tx/0x610782610a42209ff816965eb618e8ec6c5d254f9f763f04f11b19da0cc46b3b",
  recovery:
    "The chain confirmed the transfer before the HTTP response returned. Radar Keeper reconciled the proof and prevented a duplicate broadcast.",
} as const;
