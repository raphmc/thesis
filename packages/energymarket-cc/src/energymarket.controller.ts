import { ChaincodeTx } from '@worldsibu/convector-platform-fabric';

/** yup helps checking types */
import * as yup from 'yup';

import {
  Controller,
  ConvectorController,
  Invokable,
  Param,
  FlatConvectorModel
} from '@worldsibu/convector-core';

/** Import all the model files */
import { Ask, FullAsk, AskPrivateDetails } from './models/ask.model';
import { Auction, AuctionStatus } from './models/auction.model';
import { Bid, FullBid, BidPrivateDetails } from './models/bid.model';
import { Market } from './models/market.model';
import { Grid } from './models/grid.model';
import { MarketParticipant, SmartMeterReading } from './models/marketParticipant.model';

/** Import the API decorators which make it easier to create a REST API later on
 * @remarks find the documentation {@link https://medium.com/worldsibu/automatically-generate-a-nodejs-api-backend-for-hyperledger-fabric-with-convector-3ee7f3318230 | here}
 */
import { GetById, GetAll, Create, Service } from '@worldsibu/convector-rest-api-decorators';
import { toASCII } from 'punycode';
import { debug } from 'util';
import { read } from 'fs';

@Controller('energymarket')
export class EnergymarketController extends ConvectorController<ChaincodeTx> {

  /*****************************************************************
   * FUNCTIONS REGARDING MARKET PARTICIPANTS * * * * * * * * * * * * 
   *****************************************************************/

  /** Create a new 'MarketParticipant' */
  @Create('MarketParticipant')
  @Invokable()
  public async createMarketParticipant(
    @Param(MarketParticipant)
    marketParticipant: MarketParticipant
  ) {
    /** Saves the fingerprint (identity) of the invoking party in the new marketParticipant */
    marketParticipant.fingerprint = this.sender;
    
    /** Saves the new 'MarketParticipant' to state */
    await marketParticipant.save();
  }

  /** Gets all 'MarketParticipant' instances */
  @GetAll('MarketParticipant')
  @Invokable()
  public async getAllMarketParticipants()
  {
    const storedMarketParticipants = await MarketParticipant.getAll<MarketParticipant>();
    return storedMarketParticipants;
  }

  /** Gets 'MarketParticipant' with the passed 'id' */
  @GetById('MarketParticipant')
  @Invokable()
  public async getMarketParticipantById(
    @Param(yup.string())
    marketParticipantId: string
  )
  {
    const marketParticipant = await MarketParticipant.getOne(marketParticipantId);
    return marketParticipant;
  }



  /*****************************************************************
   * FUNCTIONS REGARDING AUCTIONS  * * * * * * * * * * * * * * * * *
   *****************************************************************/

  /** Create a new 'Auction' instance */
  @Create('Auction')
  @Invokable()
  public async createAuction(
    @Param(Auction)
    auction: Auction
    ) {
    /** 
     * @todo Make sure no 'Auction' existis with the same (or overlapping) time period 
     * @todo Restdrict the creation of an 'Auction' instance to 'LocalMarketOperator'
    */
    await auction.save();
  }

  /** Gets all 'Auction' instances */
  @GetAll('Auction')
  @Invokable()
  public async getAllAuctions()
  {
    const storedAuctions = await Auction.getAll<Auction>();
    return storedAuctions;
  }

  /** Gets 'Auction' with the passed 'id' */
  @GetById('Auction')
  @Invokable()
  public async getAuctionById(
    @Param(yup.string())
    auctionId: string
  )
  {
    const auction = await Auction.getOne(auctionId);
    return auction;
  }



  /*****************************************************************
   * FUNCTIONS REGARDING MARKET  * * * * * * * * * * * * * * * * * *
   *****************************************************************/

  /** Create a new 'Market' instance. Normally only one 'Market' */
  @Create('Market')
  @Invokable()
  public async createMarket(
    @Param(Market)
    market: Market
    ) {
    /** 
     * @todo Make sure no other 'Market' instance exists 
     * @todo Restrict creation of this instance to 'LocalMarketOperator' admin
    */
    await market.save();
  }

  /** Gets all 'Market' instances. Should only be one. So no '@GetById' is necessary */
  @GetAll('Market')
  @Invokable()
  public async getAllMarkets()
  {
    const storedMarkets = await Market.getAll<Market>();
    return storedMarkets;
  }


  
  /*****************************************************************
   * FUNCTIONS REGARDING GRID  * * * * * * * * * * * * * * * * * *
   *****************************************************************/

  /** Create a new 'Grid' instance. Normally only one 'Grid' */
  @Create('Grid')
  @Invokable()
  public async createGrid(
    @Param(Grid)
    grid: Grid
    ) {
    /** 
     * @todo Make sure no other 'Grid' instance exists 
     * @todo Restrict creation of this instance to 'LocalMarketOperator' admin
    */
    grid.fingerprint = this.sender;
    await grid.save();
  }

  /** Gets all 'Grid' instances. Should only be one. So no '@GetById' is necessary */
  @GetAll('Grid')
  @Invokable()
  public async getAllGrids()
  {
    const storedGrids = await Grid.getAll<Grid>();
    return storedGrids;
  }



  /*****************************************************************
   * FUNCTIONS REGARDING BIDS  * * * * * * * * * * * * * * * * * * *
   *****************************************************************/
  
  /** Transaction that places a new bid */
  @Create('Bid')
  @Invokable()
  public async placeBid():Promise<any> {
    
    /** Retrieve the data from transaction that was sent in the transient field */
    const bid = await this.tx.getTransientValue<FullBid>('bid', FullBid);

    /** Get the participant which is sending the transaction and which wants to place a bid */
    let participant = <MarketParticipant>(await MarketParticipant.query(MarketParticipant, {
      "selector": {
        "type": "de.rli.hypenergy.marketParticipant",
        "fingerprint": this.sender
      }
    }));

    if(participant.id !== bid.sender){ throw new Error(`Fingerprints don't match. Expected 'participant.id' to be ${participant.id}. But 'bid.sender' was ${bid.sender}`)}

    /** Create new Bid with the information that should be publicly visible */
    const publicBid = new Bid({
      id: bid.id,
      auctionId: bid.auctionId,
      /** @todo switch the 2 lines below, so that the bid's sender is automatically determined by the chaincode */
      sender: bid.sender 
      //sender: this.sender
    });

    /** Save new bid to the public state */
    await publicBid.save();

    /** Create new model which stores the bid's private details */
    const privateBid = new BidPrivateDetails({
      id: bid.id,
      price: bid.price,
      amount: bid.amount
    });

    /** Store the private bid details in the according private data collection */
    await privateBid.save({privateCollection: bid.sender});

    /** return the public bid details */
    return publicBid.toJSON();

    /** For testing purposes the placed bit is immediatly saved
     * @todo Remove next 2 lines when going into production
     */
    // bid.sender = this.sender;
    // await bid.save();
    // return bid;
    
    // /** Get the 'Auction' instance on which the sender is bidding */
    // const auction = await Auction.getOne(bid.auctionId);
    // const txTimestamp = this.tx.stub.getTxDate().getTime();

    // /** Check if 'Auction' is still 'OPEN' for new bids */
    // if (txTimestamp >= auction.end) {
    //   /** If it is the first bid after the 'Auction' has ended it changes the 'status' to 'CLOSED' */
    //   if(auction.status === "open") {
    //     auction.status = AuctionStatus.closed;
    //     await auction.save();
    //   }

    //   throw new Error("The auction is already closed and does not accept new bids")
    // }

    // /** If 'Auction' still 'OPEN' save the bid */
    // if (txTimestamp < auction.end) {
    //   /** Get the 'MarketParticipant' invoking this transaction */
    //   const bidder = await MarketParticipant.getOne(this.sender);

    //   /** Check if bidder has enough coins plus a buffer of 10€
    //    * @todo Make the buffer a variable. Maybe store it in the 'Market'
    //    * @todo Change buffer to -1000 !!!
    //    */
    //   if ((bidder.coinBalance + 1000) < (bid.amount * bid.price)) {
    //     throw new Error("Bidder does not have enough coins to place this bid")
    //   } else {
    //     /** Freeze the coins relative to the bid size */
    //     bidder.coinBalance -= (bid.amount * bid.price);
    //     bidder.frozenCoins += (bid.amount * bid.price);

    //     /** Adds (or overwrites) the sender of the bid as the identity invoking the transaction */
    //     bid.sender = this.sender;
    //   }

    //   /** Update bidder and save the newly placed bid */
    //   await bidder.save();
    //   await bid.save();
    //   return bid;
    // }
  
  }

  /** Gets all 'Bid' instances.
   * @todo Restrict the returned bids placed by the sender of this transaction
  */
  @GetAll('Bid')
  @Invokable()
  public async getAllBids()
  {
    const storedBids = await Bid.getAll<Bid>();
    return storedBids;
  }

  /** Gets 'Bid' with the passed 'id'
   * @todo Restrict the invocktion of this function only to those where bid.sender == this.sender
   */
  @GetById('Bid')
  @Invokable()
  public async getBidById(
    @Param(yup.string())
    bidId: string
  )
  {
    const bid = await Bid.getOne(bidId);
    return bid;
  }

  /** Returns all bids for a specific 'Auction'
   * @param auctionId the ID of the auction
  */
  @Service()
  @Invokable()
  public async getBidsByAuctionId(
    @Param(yup.string())
    auctionId: string
  )
  {
    const allBids = await Bid.getAll<Bid>();
    const bids = allBids.filter(bid => bid.auctionId === auctionId);
    return bids;
  }


  /*****************************************************************
   * FUNCTIONS REGARDING ASKS  * * * * * * * * * * * * * * * * * * *
   *****************************************************************/
  
  /** Transaction that places a new ask */
  @Create('Ask')
  @Invokable()
  public async placeAsk():Promise<any> {

    /** Retrieve the data from transaction that was sent in the transient field */
    const ask = await this.tx.getTransientValue<FullAsk>('ask', FullAsk);

    /** Get the participant which is sending the transaction and which wants to place an ask */
    let participant = <MarketParticipant>(await MarketParticipant.query(MarketParticipant, {
      "selector": {
        "type": "de.rli.hypenergy.marketParticipant",
        "fingerprint": this.sender
      }
    }));

    if(participant.id !== ask.sender){ throw new Error(`Fingerprints don't match. Expected 'participant.id' to be ${participant.id}. But 'bid.sender' was ${ask.sender}`)}

    /** Create new Ask with the information that should be publicly visible */
    const publicAsk = new Ask({
      id: ask.id,
      auctionId: ask.auctionId,
      /** @todo switch the 2 lines below, so that the ask's sender is automatically determined by the chaincode */
      sender: ask.sender
      //sender: this.sender
    });

    /** Save new ask to the public state */
    await publicAsk.save();

    /** Create new model which stores the ask's private details */
    const privateAsk = new AskPrivateDetails({
      id: ask.id,
      price: ask.price,
      amount: ask.amount
    });
    
    /** Store the private ask details in the according private data collection */
    await privateAsk.save({privateCollection: ask.sender});
    
    /** return the public ask details */
    return publicAsk.toJSON();


    // /** For testing purposes the placed ask is immediatly saved
    //  * @todo Remove next 2 lines when going into production
    //  */
    // ask.sender = this.sender;
    // await ask.save();
    // return ask;

    // /** Get the 'Auction' instance on which the sender is askding */
    // const auction = await Auction.getOne(ask.auctionId);
    // const txTimestamp = this.tx.stub.getTxDate().getTime();
    
    // /** Check if 'Auction' is still 'OPEN' for new asks */
    // if (txTimestamp >= auction.end) {

    //   /** If it is the first ask after the 'Auction' has ended it changes the 'status' to 'CLOSED' */
    //   if(auction.status === "open") {
    //     auction.status = AuctionStatus.closed;
    //     await auction.save();
    //   }

    //   throw new Error("The auction is already closed and does not accept new asks")
    // }

    // /** If 'Auction' still 'OPEN' save the ask */
    // if (txTimestamp < auction.end) {

    //   /** Adds (or overwrites) the sender of the ask as the identity invoking the transaction */
    //   ask.sender = this.sender;
      
    //   /** Save the newly placed ask */
    //   await ask.save();
    // }
  }

  /** Gets all 'Ask' instances.
   * @todo Restrict the returned asks placed by the sender of this transaction
  */
  @GetAll('Ask')
  @Invokable()
  public async getAllAsks()
  {
    const storedAsks = await Ask.getAll<Ask>();
    return storedAsks;
  }

  /** Gets 'Ask' with the passed 'id'
   * @todo Restrict the invocktion of this function only to those where ask.sender == this.sender
   */
  @GetById('Ask')
  @Invokable()
  public async getAskById(
    @Param(yup.string())
    askId: string
  )
  {
    const ask = await Ask.getOne(askId);
    return ask;
  }

  /** Returns all asks for a specific 'Auction'
   * @param auctionId the ID of the auction
  */
  @Service()
  @Invokable()
  public async getAsksByAuctionId(
    @Param(yup.string())
    auctionId: string
  )
  {
    const allAsks = await Ask.getAll<Ask>();
    const asks = allAsks.filter(ask => ask.auctionId === auctionId);
    return asks;
  }

  // /*****************************************************************
  //  * SEND METER READING  * * * * * * * * * * * * * * * * * * * * * *
  //  *****************************************************************/

  /** Transaction that send a new 'SmartMeterReading' */
  @Service()
  @Invokable()
  public async sendReading(
    @Param(SmartMeterReading)
    reading: FlatConvectorModel<SmartMeterReading>
    ){
    
    /** Get the participant which is sending the transaction and which wants to add a reading */
    let participant = <MarketParticipant>(await MarketParticipant.query(MarketParticipant, {
      "selector": {
        "type": "de.rli.hypenergy.marketParticipant",
        "fingerprint": this.sender
      }
    }));

    participant.readings.push(reading);
    await participant.save();
    return participant;
  }
  

  /*****************************************************************
   * CLEAR AUCTION FUNCTION  * * * * * * * * * * * * * * * * * * * *
   *****************************************************************/

  /** Transaction that clears the passed 'Auction' */
  @Service()
  @Invokable()
  public async clearAuction(
    @Param(yup.string())
    auctionId: string
    ):Promise<Auction> {

    /** Get the 'Auction' instance on which the sender is askding */
    const auction = await Auction.getOne(auctionId);
    
    /** @todo Uncomment next line and remove the other one! */
    // const txTimestamp = this.tx.stub.getTxDate().getTime();
    const txTimestamp = (Date.now() + 30000000);

    /** If 'Auction' still 'OPEN' throw an error */
    if (txTimestamp <= auction.end) {
      throw new Error("Auction is still 'OPEN' and cannot be cleared yet. Try again once 'txTimestamp' > 'auction.end'");
    }
    
    /** Check if 'Auction' is 'CLOSED and can be cleared */
    if (txTimestamp > auction.end) {
      
      /** Get all bids related to the specified 'auctionId' */
      const publicBids = <Bid[]>(await Bid.query(Bid, {
        "selector": {
          "type": "de.rli.hypenergy.bid",
          "auctionId": auctionId
        }
      }));

      const bids = new Array<FullBid>();
      for(const bid of publicBids) {
        const bidPrivateDetails = await BidPrivateDetails.getOne(bid.id, BidPrivateDetails, {
          privateCollection: bid.sender
        });
        const mergedBid = new FullBid({
          id: bid.id,
          auctionId: bid.auctionId,
          sender: bid.sender,
          amount: bidPrivateDetails.amount,
          price: bidPrivateDetails.price
        });
        bids.push(mergedBid);
      }

      
      /** Get all asks related to the specified 'auctionId' */
      const publicAsks = <Ask[]>(await Ask.query(Ask, {
        "selector": {
          "type": "de.rli.hypenergy.ask",
          "auctionId": auctionId
        }
      }));

      const asks = new Array<FullAsk>();
      for(const ask of publicAsks) {
        const askPrivateDetails = await AskPrivateDetails.getOne(ask.id, AskPrivateDetails, {
          privateCollection: ask.sender
        });
        const mergedAsk = new FullAsk({
          id: ask.id,
          auctionId: ask.auctionId,
          sender: ask.sender,
          amount: askPrivateDetails.amount,
          price: askPrivateDetails.price
        });
        asks.push(mergedAsk);
      }


      /** Go through all bids and asks and find the lowest price */
      let lowestPrice = [...bids, ...asks].reduce(function (acc, element) {
        if (element.price < acc) { acc = element.price }
        return acc;
      }, 9999999);

      /** Go through all bids and asks and find the highest price */
      let highestPrice = [...bids, ...asks].reduce(function (acc, element) {
        if (element.price > acc) { acc = element.price }
        return acc;
      }, 0); // can certainly be done more elegantly :)

      /** Create an Array where all amounts are summed up per price point */
      let demandCurve = new Array(30).fill(0);
      bids.map((bid) => demandCurve[bid.price] += bid.amount);

      /** Create an Array where all amounts are summed up per price point
       * @remark if a decimal point is allowed for bids -> array length = 300
       */
      let supplyCurve = new Array(30).fill(0);
      asks.map((ask) => supplyCurve[ask.price] += ask.amount);

      /** Create an actual curve by adding up amounts from previous price points
       * for supplyCurve starting at 'lowestPrice':  /
       * for demandCurve starting at 'highestPrice': \
       */
      let _highestPrice = highestPrice;
      for (let i = lowestPrice; i <= highestPrice; i++ ) {
        supplyCurve[i] += supplyCurve[i-1];
        demandCurve[_highestPrice-1] += demandCurve[_highestPrice];
        _highestPrice--;
      }

      /** Find the intersection of the two curves 
       * @todo what happens with the difference between produced amounts and consumed amounts at MCP?
       */
      for (let i = lowestPrice; i <= highestPrice; i++ ) {
        /** Go to the point where the supply equals or outpasses the demand */
        if (supplyCurve[i] >= demandCurve[i] && supplyCurve[i] != 0) {

          /** Make sure neither demand at this point nor supply one price point earlier are zero (= no match situation) */
          if (supplyCurve[i-1] === 0 && demandCurve[i] === 0) { break }

          /** If demand at this price point is smaller than supply one price point earlier -> reduce i */
          if (demandCurve[i] < supplyCurve[i-1]) {
            i--;
          }

          /** Set i as the new market clearing price for this auction
           * @todo emit new event that MCP has been found */
          auction.mcp = i;
          auction.status = AuctionStatus.cleared;   /** Set AuctionStatus to 'CLEARED' */

          /** If demand != supply -> there is an amount that will not be satisfied at the given MCP */
          let maxMatchedAmount = Math.min(supplyCurve[i], demandCurve[i]);
          auction.matchedAmount = 0; /** @todo Theoretically,  */
          /** In the case of overproduction at that MCP all bids can be tagged as successful right away */
          if (supplyCurve[i] > demandCurve[i]) {
            /** Tag all bids which price is higher of equal to the MCP as 'successful' */
            for (const bid of bids.filter(bid => bid.price >= i)) {
              /** Find the corresponding "public" bid in the publicBids array and update to 'successful' */
              await publicBids.find(publicBid => publicBid.id == bid.id).update({successful: true})
            }
            /** Tag all asks which price is smaller than the MCP as 'successful' as long as there is enough demand */
            for (const ask of asks.filter(ask => ask.price < i)) {
                maxMatchedAmount -= ask.amount;
                auction.matchedAmount += ask.amount;
                /** Find the corresponding "public" ask in the publiAsks array and update to 'successful'*/
                await publicAsks.find(publicAsk => publicAsk.id == ask.id).update({successful: true});
            }
            /** Tag all asks which price is equal to the MCP as 'successful' as long as there is enough demand */
            for (const ask of asks.filter(ask => ask.price == i)) {
              if ((maxMatchedAmount - ask.amount) >= 0) {
                maxMatchedAmount -= ask.amount;
                auction.matchedAmount += ask.amount;
                /** Find the corresponding "public" ask in the publiAsks array and update to 'successful'*/
                await publicAsks.find(publicAsk => publicAsk.id == ask.id).update({successful: true});
              } else {  
                /** Here the ask that cannot fully be satisfied is split!
                 * @remark this is a design choice that can certainly be discussed and can easily be changed by removing the next 3 lines */
                ask.unmatchedAmount = ask.amount - maxMatchedAmount;
                auction.matchedAmount += maxMatchedAmount;
                /** Find the corresponding "public" ask in the publiAsks array and update to 'successful'*/
                await publicAsks.find(publicAsk => publicAsk.id == ask.id).update({successful: true});

                /** Update the private details of the ask to include the 'unmatchedAmount' */
                const privateAsk = new AskPrivateDetails({
                  id: ask.id,
                  price: ask.price,
                  amount: ask.amount,
                  unmatchedAmount: ask.unmatchedAmount
                });
                await privateAsk.save({privateCollection: ask.sender});
                
                break;
              }
            }
          } else {  // could be else if (D > S) and then else when equal 
            /** Tag all asks which price is smaller or equal to the MCP as 'successful' */
            for (const ask of asks.filter(ask => ask.price <= i)) {
              /** Find the corresponding "public" ask in the publiAsks array and update to 'successful'*/
              await publicAsks.find(publicAsk => publicAsk.id == ask.id).update({successful: true});
            }
            /** Tag all bids which price is higher than the MCP as 'successful' as long as there is enough supply */
            for (const bid of bids.filter(bid => bid.price > i)) {
                maxMatchedAmount -= bid.amount;
                auction.matchedAmount += bid.amount;
                await publicBids.find(publicBid => publicBid.id == bid.id).update({successful: true})
            }
            /** Tag all bids which price is equal to the MCP as 'successful' as long as there is enough supply */
            for (const bid of bids.filter(bid => bid.price == i)) {
              if ((maxMatchedAmount - bid.amount) >= 0) {
                maxMatchedAmount -= bid.amount;
                auction.matchedAmount += bid.amount;
                await publicBids.find(publicBid => publicBid.id == bid.id).update({successful: true})
              } else {
                /** Here the bid that cannot fully be satisfied is split!
                 * @remark this is a design choice that can certainly be discussed and can easily be changed by removing the next 3 lines */
                bid.unmatchedAmount = bid.amount - maxMatchedAmount;
                auction.matchedAmount += maxMatchedAmount;
                await publicBids.find(publicBid => publicBid.id == bid.id).update({successful: true})
                
                /** Update the private details of the bid to include the 'unmatchedAmount' */
                const privateBid = new BidPrivateDetails({
                  id: bid.id,
                  price: bid.price,
                  amount: bid.amount,
                  unmatchedAmount: bid.unmatchedAmount
                });
                await privateBid.save({privateCollection: bid.sender});

                break;
              }
            }
          }

          auction.unmatchedDemand = demandCurve[lowestPrice] - auction.matchedAmount;
          auction.unmatchedSupply = supplyCurve[highestPrice] - auction.matchedAmount;
          
          /** Save the updated 'Auction' instance */
          auction.save();
          return auction;
        }
      }
      /** If no match could be found (no asks or no intersection) set MCP = -1 (serves as check later)
       * @remark MCP is not equal to gridBuyPrice since demand should pay gridBuyPrice while supply feeds in at gridSellPrice!
       */
      auction.mcp = -1;
      auction.status = AuctionStatus.cleared;   /** Set AuctionStatus to 'CLEARED' */
      auction.matchedAmount = 0;  /** No intersection has been found -> no match  */
      auction.unmatchedDemand = demandCurve[lowestPrice] - auction.matchedAmount;
      auction.unmatchedSupply = supplyCurve[highestPrice] - auction.matchedAmount;
      auction.save();
      return auction;
    }
  }

  
  /*****************************************************************
   * ESCROW AUCTION FUNCTION * * * * * * * * * * * * * * * * * * * *
   *****************************************************************/

  /** Transaction that clears the passed 'Auction' */
  @Service()
  @Invokable()
  public async escrowAuction(
    @Param(yup.string())
    auctionId: string
  ) {

    /** Get the 'Auction' instance on which the sender is askding */
    const auction = await Auction.getOne(auctionId);

    /** Get the 'Grid' instance in order to access grid prices
     * @todo Make this dynamic? */
    const grid = await Grid.getOne('GRID');

     /** Get the 'Market' instance in order to store coins and access grid prices
     * @todo Make this dynamic? */
    const market = await Market.getOne('MKT');
    
    /** @todo Include some type of check to see if escrow already allowed to be called */
    // const txTimestamp = this.tx.stub.getTxDate().getTime();

    const participants = await MarketParticipant.getAll();

    /** Get all bids related to the specified 'auctionId' */
    const publicBids = <Bid[]>(await Bid.query(Bid, {
      "selector": {
        "type": "de.rli.hypenergy.bid",
        "auctionId": auctionId,
        "successful": true
      }
    }));

    const successfulBids = new Array<FullBid>();
      for(const bid of publicBids) {
        const bidPrivateDetails = await BidPrivateDetails.getOne(bid.id, BidPrivateDetails, {
          privateCollection: bid.sender
        });
        const mergedBid = new FullBid({
          id: bid.id,
          auctionId: bid.auctionId,
          sender: bid.sender,
          amount: bidPrivateDetails.amount,
          price: bidPrivateDetails.price
        });
        successfulBids.push(mergedBid);
      }



    /** Get all asks related to the specified 'auctionId' */
    const publicAsks = <Ask[]>(await Ask.query(Ask, {
      "selector": {
        "type": "de.rli.hypenergy.ask",
        "auctionId": auctionId,
        "successful": true
      }
    }));
    const successfulAsks = new Array<FullAsk>();
      for(const ask of publicAsks) {
        const askPrivateDetails = await AskPrivateDetails.getOne(ask.id, AskPrivateDetails, {
          privateCollection: ask.sender
        });
        const mergedAsk = new FullAsk({
          id: ask.id,
          auctionId: ask.auctionId,
          sender: ask.sender,
          amount: askPrivateDetails.amount,
          price: askPrivateDetails.price
        });
        successfulAsks.push(mergedAsk);
      }

    /**
     * @remark It might be more efficient to map all necessary data of each participant to a new variable
     * @todo Could be implemented and tested
    let x: any;
    x = participants;
    x.consumption = x.readings.find(reading => reading.auctionPeriod == auction.id).consumed;
    x.prdouction = x.readings.find(reading => reading.auctionPeriod == auction.id).produced;
    x.bidAmount = successfulBids.filter((bid) => bid.sender == x.id).reduce((acc, bid) => {
      if (!bid.unmatchedAmount) {
        return acc + bid.amount
      } else {
        return acc + (bid.amount - bid.unmatchedAmount)
      }
    }, 0);
    x.askAmount = successfulAsks.filter((ask) => ask.sender == x.id).reduce((acc, ask) => {
      if (!ask.unmatchedAmount) {
        return acc + ask.amount
      } else {
        return acc + (ask.amount - ask.unmatchedAmount)
      }
    }, 0);
    */

    for (const participant of participants) {
      let consumption = participant.readings.find(reading => reading.auctionPeriod == auction.id).consumed;
      let production = participant.readings.find(reading => reading.auctionPeriod == auction.id).produced;
      let bidAmount = successfulBids.filter((bid) => bid.sender == participant.id).reduce((acc, bid) => {
        if (!bid.unmatchedAmount) {
          return acc + bid.amount
        } else {
          return acc + (bid.amount - bid.unmatchedAmount)
        }
      }, 0);
      let askAmount = successfulAsks.filter((ask) => ask.sender == participant.id).reduce((acc, ask) => {
        if (!ask.unmatchedAmount) {
          return acc + ask.amount
        } else {
          return acc + (ask.amount - ask.unmatchedAmount)
        }
      }, 0);

    
      /** If there was no bid and nothing has been consumed there is no need to go through these iterations */
      if (consumption != 0 || bidAmount != 0) {
        /** Demand that has been predicted is satisfied from within the local market
         * @todo Normally there is no need to add up the coins and energy of the 'Market' instance since it should cancel out with the supply side
         */
        participant.coinBalance -= bidAmount * auction.mcp;
        participant.energyBalance += bidAmount;
        market.coinBalance += bidAmount * auction.mcp;
        market.energyBalance -= bidAmount;

        /** If actual consumption exceeds the predicted demand additional electricity has to be bought from the grid
         * @remark In this solution the 'Market' instance serves as buffer between the grid and the local market.
         * This means that the 'Market' can earn coins that could possibly be used for maintenance or be part of the business model of the local market operator.
         */
        if (consumption > bidAmount) {
          participant.coinBalance -= (consumption - bidAmount) * market.gridBuyPrice;
          participant.energyBalance += (consumption - bidAmount);
          market.coinBalance += (consumption - bidAmount) * market.gridBuyPrice;
          market.energyBalance -= (consumption - bidAmount);
        }

        /** If the actual consumption is smaller than predicted, the excess energy bougth from the local market is immediatly sold back to the 'Market' instance */
        if (consumption < bidAmount) {
          participant.coinBalance += (bidAmount - consumption) * market.gridSellPrice;
          participant.energyBalance -= (bidAmount - consumption);
          market.coinBalance -= (bidAmount - consumption) * market.gridSellPrice;
          market.energyBalance += (bidAmount - consumption);
        }
      }

      /** If there was no ask or nothing produced there is no need to go through these iterations */
      if (production != 0 || askAmount != 0) {
        /** Supply that has been predicted is delivered to the local market
         * @todo Normally there is no need to add up the coins and energy of the 'Market' instance since it should cancel out with the demand side
         */
        participant.coinBalance += askAmount * auction.mcp;
        participant.energyBalance -= askAmount;
        market.coinBalance -= askAmount * auction.mcp;
        market.energyBalance += askAmount;

        /** If actual production exceeds the predicted demand additional electricity has to be bought from the grid
         * @remark In this solution the 'Market' instance serves as buffer between the grid and the local market.
         * This means that the 'Market' can earn coins that could possibly be used for maintenance or be part of the business model of the local market operator.
         */
        if (production > askAmount) {
          participant.coinBalance += (production - askAmount) * market.gridSellPrice;
          participant.energyBalance -= (production - askAmount);
          market.coinBalance -= (production - askAmount) * market.gridSellPrice;
          market.energyBalance += (production - askAmount);
        }

        /** If the actual production is smaller than predicted, the missing energy has to be bougth from the local market immediatly in order to satisfy the placed 'Ask' */
        if (production < askAmount) {
          participant.coinBalance -= (askAmount - production) * market.gridBuyPrice;
          participant.energyBalance += (askAmount - production);
          market.coinBalance += (askAmount - production) * market.gridBuyPrice;
          market.energyBalance -= (askAmount - production);
        }
      }
    }


    /** If the energybalance of the market is negative the missing energy has to be bought from the grid */
    if (market.energyBalance < 0) {
      grid.coinBalance += (- market.energyBalance) * market.gridBuyPrice;;
      grid.energyBalance -= (- market.energyBalance);
      market.coinBalance -= (- market.energyBalance) * market.gridBuyPrice;
      market.energyBalance += (- market.energyBalance);
    }

    /** If the energybalance of the market is positive the excess energy is sold to the grid */
    if (market.energyBalance > 0) {
      grid.coinBalance -= market.energyBalance * market.gridSellPrice;;
      grid.energyBalance += market.energyBalance;
      market.coinBalance += market.energyBalance * market.gridSellPrice;
      market.energyBalance -= market.energyBalance;
    }

    /** Save the changed participants, market and grid */
    Promise.all(participants.map(participant => participant.save()));
    await market.save();
    await grid.save();
    
    /** Return them for illustration purposes */
    return {
      participants: participants,
      market: market,
      grid: grid
    }
  }


  
  /*****************************************************************
   * BUY FROM GRID FUNCTION  * * * * * * * * * * * * * * * * * * * *
   *****************************************************************/

   /** Transaction that transfers coins from one participant to the 'PUBLICGRID' 
    * @todo Make it a private transaction only invokable by the Escrow function
   */
  @Service()
  @Invokable()
  public async buyFromGrid(
    @Param(yup.string())
    buyerId: string,
    @Param(yup.number())
    amount: number
    ) {
    /** Get the 2 relevant 'MarketParticipants' */
    const buyer = await MarketParticipant.getOne(buyerId);
    const grid = await Grid.getOne('GRID');

    if (!buyer.id) {
      throw new Error(`Source participant ${buyer} doesn't exist`);
    }
    
    if (!grid.id) {
      throw new Error(`Grid instance doesn't exist`);
    }

    /** @remark since the escrow function will be calling this it is not possible to check it like this! */
    /**
     if (fromParticipant.id != this.sender) {
       throw new Error(`Permission denied! Only the owner can transfer coins`)
    }
    */

    /** @todo should not be possible for participants to invoke this transaction outisde the escrow function */
    if(buyer.coinBalance < amount || buyer.frozenCoins < amount) {
      throw new Error(`Participant ${buyer} doesn't have enough coins`)
    }

    buyer.coinBalance -= amount * grid.gridBuyPrice;
    buyer.energyBalance += amount;
    grid.coinBalance += amount * grid.gridBuyPrice;
    grid.energyBalance -= amount;

    return {
      buyer: buyer, 
      grid: grid
    }
 }



  /*****************************************************************
   * TRANSFER FUNCTION * * * * * * * * * * * * * * * * * * * * * * *
   *****************************************************************/

   /** Transaction that transfers coins from one participant to the other 
    * @todo Maybe make it a private transaction only invokable by the Escrow function
   */
   @Service()
   @Invokable()
   public async transferCoins(
    @Param(yup.string())
    from: string,
    @Param(yup.string())
    to: string,
    @Param(yup.number())
    amount: number
    ) {
    /** Get the 2 relevant 'MarketParticipants' */
    const fromParticipant = await MarketParticipant.getOne(from);
    const toParticipant = await MarketParticipant.getOne(to);

    if (!fromParticipant.id) {
      throw new Error(`Source participant ${from} doesn't exist`);
    }
    
    if (!toParticipant.id) {
      throw new Error(`Destination participant ${to} doesn't exist`);
    }

    /** @remark since the escrow function will be calling this it is not possible to check it like this! */
    /**
    if (fromParticipant.id != this.sender) {
      throw new Error(`Permission denied! Only the owner can transfer coins`)
    }
    */

    /** @todo should not be possible for participants to invoke this transaction outisde the escrow function */
    if(fromParticipant.coinBalance < amount || fromParticipant.frozenCoins < amount) {
      throw new Error(`Participant ${from} doesn't have enough coins`)
    }

    fromParticipant.coinBalance -= amount;
    toParticipant.coinBalance += amount;

    await Promise.all([fromParticipant.save(), toParticipant.save()]);
  }






}