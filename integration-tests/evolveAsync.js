import fetch from 'node-fetch';
import dotenv from 'dotenv';
// use endpoint from env
dotenv.config();

const endpoint = 'http://localhost:4001/graphql';
const apiKey = process.env.API_KEY;

const mutation = `
  mutation EvolveBatchAsync{
  evolveBatchAsync(  
    input: {
      chainId: "137", 
      contractAddress: "0xa8c08957b6846eb5289942e04d75f61064bdd38d", 
      tokens: {
        tokenId: "60501946339228290821589163127364490024067410997104244035085202817167327646351", 
        name: "test"}
        }) {
    message
    status
    txHash
    tokenIds
  }
}
`;

const query = `
  query MintStatus($txHash: String!) {
    evolveBatchResponse(txHash: $txHash) {
      status
      txHash
      tokenIds
      message
      receipt {
        blockHash
        blockNumber
        gasUsed
      }
    }
  }
`;

async function evolveToken() {
  try {
    console.log('Sending mint request...');
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `API-KEY ${apiKey}`,
      },
      body: JSON.stringify({ query: mutation }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const result = await response.json();
    console.log('Result:', result);
    const txHash = result?.data?.evolveBatchAsync?.txHash;

    if (!txHash) {
      throw new Error('Transaction hash not found in response.');
    }

    console.log('Mint initiated. Waiting to check status...');
    await new Promise((resolve) => setTimeout(resolve, 500)); // Wait 0.5 seconds before first check
    await checkMintStatus(txHash);
  } catch (error) {
    console.error('Error:', error.message);
  }
}

async function checkMintStatus(txHash) {
  for (let i = 0; i < 5; i++) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          query: query,
          variables: { txHash },
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      const result = await response.json();
      const evolveResponse = result?.data?.evolveBatchResponse;

      console.log(`Attempt ${i + 1}:`, evolveResponse);

      if (evolveResponse?.status === 'SUCCESS') {
        console.log('Transaction succeeded:', evolveResponse);
        return;
      }

      console.log('Status not successful. Retrying...');
      await new Promise((resolve) => setTimeout(resolve, 3000)); // Wait 3 seconds before the next attempt
    } catch (error) {
      console.error('Error while checking status:', error.message);
    }
  }

  console.log('Transaction did not succeed within 5 attempts.');
}

evolveToken();