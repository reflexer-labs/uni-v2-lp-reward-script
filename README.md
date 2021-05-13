## Run

Add the following variables in a `.env` file

```
# Url of a subgraph
GEB_SUBGRAPH_URL=https://subgraph.reflexer.finance/subgraphs/name/reflexer-labs/rai
# Start of the campaign block
START_BLOCK=11923942
# End of the campaign block
END_BLOCK=11978942
# Total reward distributed over the campaign
REWARD_AMOUNT=10000
# Ethereum RPC
RPC_URL=https://mainnet.infura.io/v3/<KEY>
```

Run:

```
npm run start
```

Output file: `rewards.csv`

## Test

```
npm run test
```
