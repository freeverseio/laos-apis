// Import dependencies
import { TokenQuery } from './TokenQuery';
import { GqlClient } from './GqlClient';
import { ApolloQueryResult } from '@apollo/client';
import { ChainId } from '../../types';

jest.mock('./GqlClient', () => ({
  GqlClient: jest.fn().mockImplementation(() => ({
    query: jest.fn() as jest.MockedFunction<(options: any) => Promise<ApolloQueryResult<any>>>,
  })),
}));

describe('TokenQuery - fetchTokensByOwner', () => {
  const mockData = {
    data: {
      polygon: {
        tokens: {
          totalCount: 18,
          edges: [
            {
              cursor: 'cursor1',
              node: {
                attributes: [
                  {
                    value: '2748779069630',
                    traitType: 'ID',
                  },
                ],
                block_number: 241353,
                description: null,
                image: null,
                name: null,
                tokenId: '5859940151081954314402908485620542763290938128937918929447',
              },
            },
          ],
        },
      },
    },
  };

  let tokenQuery: TokenQuery;
  let gqlClient: jest.Mocked<GqlClient>;

  beforeEach(() => {
    gqlClient = new GqlClient() as jest.Mocked<GqlClient>;
    gqlClient.query.mockResolvedValue(mockData);

    tokenQuery = new TokenQuery();
    (tokenQuery as any).gqlClient = gqlClient;

    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should fetch tokens by owner', async () => {
    const input = {
      chainId: ChainId.POLYGON,
      accountAddress: '0xowneraddress',
      page: { pageSize: 10, sort: [] },
      includeMetadata: true,
    };

    const result = await tokenQuery.fetchTokensByOwner(input);

    expect(gqlClient.query).toHaveBeenCalledWith(expect.objectContaining({
      query: expect.anything(),
      fetchPolicy: 'no-cache',
    }));
    expect(result.tokens).toHaveLength(1);
    expect(result.tokens[0].tokenId).toBe('5859940151081954314402908485620542763290938128937918929447');
    expect(result.tokens[0].blockNumber).toBe(241353);
    expect(result.page?.more).toBe(false);
  });

  it('should handle empty token results', async () => {
    gqlClient.query.mockResolvedValueOnce({
      data: {
        polygon: { tokens: { totalCount: 0, edges: [] } },
      },
    });

    const input = {
      chainId: ChainId.POLYGON,
      accountAddress: '0xowneraddress',
      page: { pageSize: 10, sort: [] },
      includeMetadata: true,
    };

    const result = await tokenQuery.fetchTokensByOwner(input);

    expect(result.tokens).toHaveLength(0);
    expect(result.page?.more).toBe(false);
  });

  it('should throw an error when gqlClient query fails', async () => {
    gqlClient.query.mockRejectedValue(new Error('GraphQL query failed'));

    const input = {
      chainId: ChainId.POLYGON,
      accountAddress: '0xowneraddress',
      page: { pageSize: 10, sort: [] },
      includeMetadata: true,
    };

    await expect(tokenQuery.fetchTokensByOwner(input)).rejects.toThrow('Could not fetch token by owner.');
  });
});
