import { TokenMapper } from "./TokenMapper";
import { TokenIndexer, AttributeIndexer, ChainId } from "../../types";

describe("TokenMapper", () => {
  const inputTokens: TokenIndexer[] = [
    {
      attributes: [
        { value: "2748779069736", traitType: "ID" },
        { value: "1352", traitType: "Defence" },
        { value: "989", traitType: "Speed" },
        { value: "880", traitType: "Pass" },
        { value: "871", traitType: "Shoot" },
        { value: "905", traitType: "Endurance" },
        { value: "M L", traitType: "Preferred Position" },
        { value: "3", traitType: "Potential" },
        { value: "CN", traitType: "Country of Birth" },
        { value: "0", traitType: "Tiredness" },
        { value: "21", traitType: "Age" },
      ],
      tokenId: "94635553975731813549050915545394364355688529545086776129190805410002304523125",
      image: "ipfs://QmXEx4oVwoHSeSSLFW5HN6vjgKCh7mCve5Z7VUnb7ha3pj",
      name: "Feng Rivero",
      description: "description",
      owner: "0xc69f5121e79155f036acf8d2bdef50cee0c05b75",
      contractAddress: "0x1fc0b17a5ca075345fbf9701475a7fc25b8a16c5",
      createdAt: "2024-11-27T16:08:36.000Z",
    },
  ];

  describe("mapAttributes", () => {
    it("should map attributes into a single record of traitType and value", () => {
      const attributes: AttributeIndexer[] = [
        { value: "2748779069736", traitType: "ID" },
        { value: "1352", traitType: "Defence" },
      ];

      const result = TokenMapper.mapAttributes(attributes);

      expect(result).toEqual({
        ID: "2748779069736",
        Defence: "1352",
      });
    });
  });

  describe("mapTokenSupply", () => {
    it("should correctly map a single token to TokenSupply format", () => {
      const chainId = 1;
      const contractAddress = "0x1fc0b17a5ca075345fbf9701475a7fc25b8a16c5";
      const token = inputTokens[0];

      const result = TokenMapper.mapTokenSupply(token, chainId, contractAddress, true);

      expect(result).toEqual({
        tokenID: token.tokenId,
        supply: "1",
        chainId: chainId,
        contractInfo: {
          chainId: chainId,
          address: contractAddress,
          name: "Universal Contract",
          type: "ERC721",
          symbol: "UC",
          decimals: 0,
          logoURI: "",
          deployed: true,
          bytecodeHash: "",
          extensions: {
            link: "",
            description: "",
            ogImage: "",
            originChainId: chainId,
            originAddress: contractAddress,
            verified: true,
          },
          updatedAt: "",
        },
        tokenMetadata: {
          tokenId: token.tokenId,
          name: token.name,
          description: token.description,
          image: token.image,
          properties: {
            ID: "2748779069736",
            Defence: "1352",
            Speed: "989",
            Pass: "880",
            Shoot: "871",
            Endurance: "905",
            "Preferred Position": "M L",
            Potential: "3",
            "Country of Birth": "CN",
            Tiredness: "0",
            Age: "21",
          },
          attributes: token.attributes,
          external_url: "",
          decimals: 0,
          updatedAt: token.createdAt,
        },
      });
    });
  });

  describe("mapTokenSupplies", () => {
    it("should map an array of tokens to TokenSuppliesResponse format", () => {
      const chainId = 1;
      const contractAddress = "0x1fc0b17a5ca075345fbf9701475a7fc25b8a16c5";

      const result = TokenMapper.mapTokenSupplies(
        {
          tokens: inputTokens,
          page: { after: "sample_cursor", pageSize: 50, more: true },
        },
        {
          chainId: ChainId.POLYGON,
          contractAddress: contractAddress, 
          includeMetadata: true
        },
        chainId,
        contractAddress
      );

      expect(result).toEqual({
        page: {
          after: "sample_cursor",
          pageSize: 50,
          more: true,
        },
        contractType: "ERC721",
        tokenIDs: inputTokens.map((token) =>
          TokenMapper.mapTokenSupply(token, chainId, contractAddress, true)
        ),
      });
    });
  });

  describe("mapTokenBalances", () => {
    it("should map an array of tokens to TokenBalancesResponse format", () => {
      const chainId = 1;
      const inputRequest = { 
        chainId: ChainId.POLYGON,
        includeMetadata: true,
        accountAddress: "0xc69f5121e79155f036acf8d2bdef50cee0c05b75"
      };
      const tokenResponse = {
        tokens: inputTokens,
        page: { after: "cursor1", pageSize: 100, more: false },
        
      };

      const result = TokenMapper.mapTokenBalances(tokenResponse, inputRequest, chainId);

      expect(result).toEqual({
        page: {
          after: "cursor1",
          pageSize: 100,
          more: false,
        },
        balances: inputTokens.map((token) =>
          TokenMapper.mapTokenBalance(token, chainId, inputRequest.includeMetadata)
        ),
      });
    });
  });
});
