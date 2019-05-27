// tslint:disable:no-unused-expression
import { join, resolve } from 'path';
import { keyStore, identityName, channel, chaincode, networkProfile, identityId, identityOrg } from './env';
import { expect } from 'chai';
import * as uuid from 'uuid/v4';
import { MockControllerAdapter } from '@worldsibu/convector-adapter-mock';
import { FabricControllerAdapter } from '@worldsibu/convector-adapter-fabric';
import { ClientFactory, ConvectorControllerClient, FlatConvectorModel, BaseStorage } from '@worldsibu/convector-core';
import 'mocha';

import { EnergymarketController } from '../src';
import { Ask, AskPrivateDetails, FullAsk } from '../src/models/ask.model';
import { Auction } from '../src/models/auction.model';
import { Bid, BidPrivateDetails, FullBid } from '../src/models/bid.model';
import { Market } from '../src/models/market.model';
import { Grid } from '../src/models/grid.model';
import { MarketParticipant, ParticipantType, SmartMeterReading } from '../src/models/marketParticipant.model';
import { ENGINE_METHOD_ALL } from 'constants';
//import { debug } from 'util';
import { read } from 'fs';
// import { parentPort } from 'worker_threads';

describe('Energymarket', () => {

  /** Change this number to the number of organisations participating in the local market */
  const numberOfOrganisations = 4;

  const homedir = require('os').homedir();

  /** Create an array looking like ["org1", "org2", ...] */
  let identityOrg = new Array<string>(numberOfOrganisations);
  for(let i=0; i<numberOfOrganisations; i++){identityOrg[i] = "org" + (i+1);};

  /** This array will be used as IDs for market participants: ["PAR_org1", "PAR_org2", ...] */
  const identityId:string[] = identityOrg.map(org => org = "PAR_" + org );

  /** Declare two empty objects */
  const adapter: {[k: string]: FabricControllerAdapter} = {};
  const energymarketCtrl: {[k: string]: ConvectorControllerClient<EnergymarketController>} = {};

  // let adapter: MockControllerAdapter;
  // let energymarketCtrl: ConvectorControllerClient<EnergymarketController>;
  
  before(async () => {
    /** Array containing the Paths to the key for every organisation */
    const keyStore:string[] = identityOrg.map(org => org = `/${homedir}/hyperledger-fabric-network/.hfc-${org}`);
    /** Array containting the Paths to all network profiles for every organisation */
    const networkProfile:string[] = identityOrg.map(org => org = `/${homedir}/hyperledger-fabric-network/network-profiles/${org}.network-profile.yaml`);

    /** Some constants that are necessary for instantiating the FabricAdapter but are equal for all organisations */
    const chaincode = 'energymarket';
    const channel = 'ch1';
    const identityName = 'user1';   // the identity of the person in the orgaisation making the call (admin or user1, ...)
    const port = 8000;
    const couchDBView = 'ch1_energymarket';
    const couchDBProtocol = 'http';
    const couchDBHost = 'localhost';
    const couchDBPort = 5084;

    // /** Create an blockchain adapter for every organisation to make calls from different "perspectives" */
    // let adapter_org1 = new FabricControllerAdapter({
    //   txTimeout: 300000,
    //   user: "user1",
    //   channel: "ch1",
    //   chaincode: "energymarket",
    //   keyStore: `/${homedir}/hyperledger-fabric-network/.hfc-${identityOrg}`,
    //   networkProfile: `/${homedir}/hyperledger-fabric-network/network-profiles/${identityOrg}.network-profile.yaml`
    //   // userMspPath: keyStore
    // });

    /** Create a Fabric adapter and controller and fill the above objects  */
    for(let i=0; i<numberOfOrganisations; i++){
      adapter['org'+(i+1)] = new FabricControllerAdapter({
        txTimeout: 300000,
        user: identityName,
        channel: channel,
        chaincode: chaincode,
        keyStore: resolve(__dirname, keyStore[i]),
        networkProfile: resolve(__dirname, networkProfile[i])
        // userMspPath: keyStore
      });
      await adapter['org'+(i+1)].init();
      energymarketCtrl['org'+(i+1)] = ClientFactory(EnergymarketController, adapter['org'+(i+1)]);
      };

    /** In case not a "real" blockchain should be used uncomment the following: */
    // adapter = new MockControllerAdapter();
    // energymarketCtrl = ClientFactory(EnergymarketController, adapter);

    // await adapter.init([
    //   {
    //     version: '*',
    //     controller: 'EnergymarketController',
    //     name: join(__dirname, '..')
    //   }
    // ]);
  });

  // it('should create a MarketParticipant and send first SmartMeterReading', async () => {

  //   const participant = new MarketParticipant({
  //     id: uuid(),
  //     name: "Anton",
  //     is: 1,
  //   });
  //   console.log(participant);

  //   let numberOfReadings = 10;
  //   let readings = new Array<SmartMeterReading>(numberOfReadings);
  //   for (let i=0; i<numberOfReadings; i++) {
  //     readings[i] = new SmartMeterReading('AUC' + (i+1).toString());
  //     readings[i].auctionPeriod = (i+1).toString();
  //     readings[i].consumed = Math.floor(Math.random() * 100) + 1;
  //     readings[i].produced = Math.floor(Math.random() * 100) + 1;
  //   }
  //   console.log(readings);

  //   await energymarketCtrl.createMarketParticipant(participant);
  //   let savedParticipant = await adapter.getById<MarketParticipant>(participant.id);
  //   console.log(savedParticipant);

  //   for (const reading of readings) { await energymarketCtrl.sendReading(reading, participant.id) };
  //   // await energymarketCtrl.sendReading(data, participant.id);
  //   savedParticipant = await adapter.getById<MarketParticipant>(participant.id);
  //   console.log(savedParticipant);

  //   expect(savedParticipant.id).to.exist;
  //   expect(savedParticipant.readings).to.be.an('array').lengthOf(numberOfReadings);
  // });
  
  it('should create a market', async () => {
    for(let i=1; i<=numberOfOrganisations; i++){
      const market = new Market({
        id: "MARKETT_" + identityOrg[i-1],
        gridBuyPrice: 28,
        gridSellPrice: 5,
        auctionTime: 900000
      });
      
      await energymarketCtrl['org' + i].createMarket(market);
    };
    const savedMarket = await energymarketCtrl.org1.getAllMarkets().then(market => market.map(market => new Market(market)));;
    console.log(savedMarket);
    debugger;

    let signingIdentity = adapter.org1.user.getSigningIdentity();
    let identity = adapter.org1.user.getIdentity();
    adapter.org1.user.

    expect(savedMarket[0].id).to.exist;
    expect(savedMarket[numberOfOrganisations].id).to.exist;
  });

  // it('should create a participant, an auction, a bid and an ask', async () => {

  //   const participant = new MarketParticipant({
  //     id: "B6:0B:37:7C:DF:D2:7A:08:0B:98:BF:52:A4:2C:DC:4E:CC:70:91:E1",
  //     name: "Anton",
  //     is: 1,
  //     coinBalance: 100000000000
  //   });
  //   console.log(participant);

  //   await energymarketCtrl.createMarketParticipant(participant);
    

  //   const auction = new Auction({
  //     id: uuid(),
  //     start: Date.now(),
  //     end: (Date.now() + 100000),
  //   });

  //   await energymarketCtrl.createAuction(auction);
  //   let savedAuction = await adapter.getById<Auction>(auction.id);
  //   console.log(savedAuction);

  //   let numberOfBids = 10;
  //   let bids = new Array<Bid>(numberOfBids)
  //   for (let i=0; i<numberOfBids; i++) {
  //     bids[i] = new Bid({ id: uuid(), auctionId: auction.id, amount: Math.floor(Math.random() * 100) + 1, price: Math.floor(Math.random() * 20) + 5});
  //   }
  //   for (const bid of bids) { await energymarketCtrl.placeBid(bid)};
  //   // await Promise.all(bids.map(bid => energymarketCtrl.placeBid(bid)));
  //   let savedBids = await energymarketCtrl.getAllBids().then(bids => bids.map(bid => new Bid(bid)));
    
  //   // const bid = new Bid({
  //   //   id: uuid(),
  //   //   auctionId: auction.id,
  //   //   amount: 20,
  //   //   price: 10,
  //   //   sender: "this is the string of the sender",
  //   // })

  //   // const bid2 = new Bid({
  //   //   id: uuid(),
  //   //   auctionId: auction.id,
  //   //   amount: 30,
  //   //   price: 15,
  //   //   sender: "another sender"
  //   // })
    
  //   // await energymarketCtrl.placeBid(bid);
  //   // await energymarketCtrl.placeBid(bid2);
  
  //   let numberOfAsks = 10;
  //   let asks = new Array<Ask>(numberOfAsks)
  //   for (let i=0; i<numberOfAsks; i++) {
  //     asks[i] = new Ask({ id: uuid(), auctionId: auction.id, amount: Math.floor(Math.random() * 100) + 1, price: Math.floor(Math.random() * 20) + 5});
  //   }
  //   for (const ask of asks) { await energymarketCtrl.placeAsk(ask)};
  //   let savedAsks = await energymarketCtrl.getAllAsks().then(asks => asks.map(ask => new Ask(ask)));

  //   // const ask = new Ask({
  //   //   id: uuid(),
  //   //   auctionId: auction.id,
  //   //   amount: 50,
  //   //   price: 15,
  //   //   sender: "sender",
  //   // })

  //   // const ask2 = new Ask({
  //   //   id: uuid(),
  //   //   auctionId: auction.id,
  //   //   amount: 10,
  //   //   price: 20,
  //   //   sender: "sender",
  //   // })

  //   // await energymarketCtrl.placeAsk(ask);
  //   // await energymarketCtrl.placeAsk(ask2);

    

  //   /** Clear the auction */
  //   await energymarketCtrl.clearAuction(auction.id).catch(ex => ex.responses[0].error.message);

  //   // let numberOfReadings = 10;
  //   // let readings = new Array<SmartMeterReading>(numberOfReadings);
  //   // for (let i=0; i<numberOfReadings; i++) {
  //   //   readings[i] = new SmartMeterReading('AUC' + (i+1).toString());
  //   //   readings[i].auctionPeriod = (i+1).toString();
  //   //   readings[i].consumed = Math.floor(Math.random() * 100) + 1;
  //   //   readings[i].produced = Math.floor(Math.random() * 100) + 1;
  //   // }
  //   // console.log(readings);
  //   // for (const reading of readings) { await energymarketCtrl.sendReading(reading, participant.id) };



  //   savedAuction = await adapter.getById<Auction>(auction.id);
  //   console.log(savedAuction);
  //   savedBids = await energymarketCtrl.getAllBids().then(bids => bids.map(bid => new Bid(bid)));
  //   console.log(savedBids);
  //   savedAsks = await energymarketCtrl.getAllAsks().then(asks => asks.map(ask => new Ask(ask)));
  //   console.log(savedAsks);
  //   const savedParticipant = await adapter.getById<MarketParticipant>(participant.id);
  //   console.log(savedParticipant);

  //   let sumDemand = savedAuction.matchedAmount + savedAuction.unmatchedDemand;
  //   let sumSupply = savedAuction.matchedAmount + savedAuction.unmatchedSupply;
  //   let sumBids = bids.reduce( (acc, bid) => acc += bid.amount, 0);
  //   let sumAsks = asks.reduce( (acc, ask) => acc += ask.amount, 0);

  //   let edge: number;
  //   for (const element of [...savedBids, ...savedAsks]) {
  //     if (element.unmatchedAmount) {edge = element.price};
  //   }
  //   console.log(`Bid or Ask on the edge is ${edge} and a MCP of ${savedAuction.mcp}`);

  //   // expect(savedAuction.matchedAmount).to.be.eql(30);
  //   expect(edge).to.be.eql(savedAuction.mcp);
  //   expect(savedAuction.mcp).to.exist;
  //   expect(savedParticipant.id).to.exist;
  //   expect(savedBids).to.be.an('array').that.has.lengthOf(numberOfBids);
  //   savedBids.forEach(element => expect(element).to.have.deep.property('id'));
  //   // expect(savedBids[1]).to.have.property('successful', true);
  //   expect(savedAsks).to.be.an('array').that.has.lengthOf(numberOfAsks);
  //   savedAsks.forEach(element => expect(element).to.have.property('id'));
  //   expect(savedAsks[0]).to.have.deep.property('unmatchedAmount');
  //   expect(sumDemand).to.be.eql(sumBids);
  //   expect(sumSupply).to.be.eql(sumAsks);
  // });




  // it('should test the escrow function', async () => {

  //   const market = new Market({
  //     id: "MKT",
  //     gridBuyPrice: 25,
  //     gridSellPrice: 5
  //   });
  //   await energymarketCtrl.org1.createMarket(market).catch(ex => ex.responses[0].error.message);

  //   const grid = new Grid({
  //     id: "GRID",
  //     gridBuyPrice: 25,
  //     gridSellPrice: 5
  //   });
  //   await energymarketCtrl.org1.createGrid(grid).catch(ex => ex.responses[0].error.message);

  //   const auction = new Auction({
  //     id: uuid(),
  //     start: Date.now(),
  //     end: (Date.now() + 100000),
  //   });
  //   await energymarketCtrl.org1.createAuction(auction).catch(ex => ex.responses[0].error.message);
      
  //   let numberOfParticipants = numberOfOrganisations;
  //   let participants = new Array<MarketParticipant>(numberOfParticipants);
  //   for (let i=0; i<numberOfParticipants; i++) {
  //     participants[i] = new MarketParticipant({
  //       id: identityId[i],
  //       name: "Anton" + (i+1),
  //       is: ParticipantType.prosumer,
  //       coinBalance: 0,
  //       energyBalance: 0
  //     })
  //   }

  //   for (const participant of participants) { await energymarketCtrl.createMarketParticipant(participant) };
    
  //   let committedParticipants = await energymarketCtrl.getAllMarketParticipants().then(participant => participant.map(participant => new MarketParticipant(participant)));
  //   console.log(committedParticipants);


  //   // const participant = new MarketParticipant({
  //   //   id: "PAR1",
  //   //   name: "Anton",
  //   //   is: 1,
  //   //   coinBalance: 0,
  //   //   energyBalance: 0
  //   // });
  //   // await energymarketCtrl.createMarketParticipant(participant).catch(ex => ex.responses[0].error.message);

  //   // const participant2 = new MarketParticipant({
  //   //   id: "PAR2",
  //   //   name: "Antonia",
  //   //   is: 2,
  //   //   coinBalance: 0,
  //   //   energyBalance: 0
  //   // });
  //   // await energymarketCtrl.createMarketParticipant(participant2).catch(ex => ex.responses[0].error.message);

  //   let numberOfBids = 30;
  //   let bids = new Array<FullBid>(numberOfBids);
  //   for (let i=0; i<numberOfBids; i++) {
  //     bids[i] = new FullBid({ 
  //       id: uuid(), 
  //       auctionId: auction.id, 
  //       amount: Math.floor(Math.random() * 100) + 1, 
  //       price: Math.floor(Math.random() * 21) + 5,
  //       sender: participants[Math.floor(Math.random() * 10)].id
  //     });
  //   }
  //   for (const bid of bids) { 
  //     await energymarketCtrl
  //       .$config({transient: { bid: bid.toJSON() }})
  //       .placeBid();
  //   };

    

  //   // await Promise.all(bids.map(bid => energymarketCtrl.placeBid(bid)));
  //   // let savedBids = await energymarketCtrl.getAllBids().then(bids => bids.map(bid => new Bid(bid)));
    
  //   // const bid = new Bid({
  //   //   id: uuid(),
  //   //   auctionId: auction.id,
  //   //   amount: 50,
  //   //   price: 10,
  //   //   sender: participant.id,
  //   // })
  //   // await energymarketCtrl.placeBid(bid).catch(ex => ex.responses[0].error.message);
    
  
  //   let numberOfAsks = 30;
  //   let asks = new Array<FullAsk>(numberOfAsks)
  //   for (let i=0; i<numberOfAsks; i++) {
  //     asks[i] = new FullAsk({ 
  //       id: uuid(), 
  //       auctionId: auction.id, 
  //       amount: Math.floor(Math.random() * 100) + 1, 
  //       price: Math.floor(Math.random() * 20) + 5,
  //       sender: participants[Math.floor(Math.random() * 9)].id
  //     });
  //   }
  //   for (const ask of asks) { 
  //     await energymarketCtrl
  //       .$config({transient: { ask: ask.toJSON() }})
  //       .placeAsk();
  //   };

  //   let placedBids = await energymarketCtrl.getBidsByAuctionId(auction.id).catch(ex => ex.responses[0].error.message).then(bids => bids.map(bid => new Bid(bid)));
  //   let placedAsks = await energymarketCtrl.getAsksByAuctionId(auction.id).catch(ex => ex.responses[0].error.message).then(asks => asks.map(ask => new Ask(ask)));;
   
  //   // let savedAsks = await energymarketCtrl.getAllAsks().then(asks => asks.map(ask => new Ask(ask)));

  //   // const ask = new Ask({
  //   //   id: uuid(),
  //   //   auctionId: auction.id,
  //   //   amount: 50,
  //   //   price: 10,
  //   //   sender: participant2.id,
  //   // })
  //   // await energymarketCtrl.placeAsk(ask).catch(ex => ex.responses[0].error.message);

  //   /** Clear the auction */
  //   await energymarketCtrl.clearAuction(auction.id).catch(ex => ex.responses[0].error.message);
    
  //   let successfulBids = await energymarketCtrl.getBidsByAuctionId(auction.id).catch(ex => ex.responses[0].error.message).then(bids => bids.map(bid => new Bid(bid)));
  //   successfulBids = successfulBids.filter(bid => bid.successful == true);
  //   let successfulAsks = await energymarketCtrl.getAsksByAuctionId(auction.id).catch(ex => ex.responses[0].error.message).then(asks => asks.map(ask => new Ask(ask)));;
  //   successfulAsks = successfulAsks.filter(ask => ask.successful == true);
  //   let savedParticipants = await energymarketCtrl.getAllMarketParticipants().then(participant => participant.map(participant => new MarketParticipant(participant)));

  //   let fullSuccessfulBids = new Array<FullBid>();
  //   for(const successfulBid of successfulBids) {
  //     const bidPrivateRaw = await adapter.stub.getPrivateData(successfulBid.sender, successfulBid.id);
  //     const bidPrivate = new BidPrivateDetails(JSON.parse(bidPrivateRaw.toString('utf8')));
  //     let bidMerged = new FullBid({
  //       id: successfulBid.id,
  //       auctionId: successfulBid.auctionId,
  //       sender: successfulBid.sender,
  //       successful: successfulBid.successful,
  //       unmatchedAmount: bidPrivate.unmatchedAmount,
  //       amount: bidPrivate.amount,
  //       price: bidPrivate.price
  //     })
  //     fullSuccessfulBids.push(bidMerged);
  //   }

  //   let fullSuccessfulAsks = new Array<FullAsk>();
  //   for(const successfulAsk of successfulAsks) {
  //     const askPrivateRaw = await adapter.stub.getPrivateData(successfulAsk.sender, successfulAsk.id);
  //     const askPrivate = new AskPrivateDetails(JSON.parse(askPrivateRaw.toString('utf8')));
  //     let askMerged = new FullAsk({
  //       id: successfulAsk.id,
  //       auctionId: successfulAsk.auctionId,
  //       sender: successfulAsk.sender,
  //       successful: successfulAsk.successful,
  //       unmatchedAmount: askPrivate.unmatchedAmount,
  //       amount: askPrivate.amount,
  //       price: askPrivate.price
  //     })
  //     fullSuccessfulAsks.push(askMerged);
  //   }
    
  //   let numberOfReadings = 10;
  //   let readings = new Array<SmartMeterReading>(numberOfReadings);
  //   for (let i=0; i<numberOfReadings; i++) {
  //     let bidAmount = fullSuccessfulBids.filter(bid => bid.sender == "PAR" + (i+2)).reduce((acc,bid) => acc + bid.amount, 0);
  //     let askAmount = fullSuccessfulAsks.filter(ask => ask.sender == "PAR" + (i+2)).reduce((acc,ask) => acc + ask.amount, 0);
  //     readings[i] = new SmartMeterReading({
  //       id: auction.id,
  //       auctionPeriod: auction.id,
  //       consumed: bidAmount + Math.floor(Math.random() * bidAmount/10) - Math.floor(Math.random() * bidAmount/10),
  //       produced: askAmount + Math.floor(Math.random() * askAmount/10) - Math.floor(Math.random() * askAmount/10)
  //     })
  //     await energymarketCtrl.sendReading(readings[i], participants[i].id);
  //   }

  //   // let reading1 = new SmartMeterReading({
  //   //   id: auction.id,
  //   //   auctionPeriod: auction.id,
  //   //   consumed: 40,
  //   //   produced: 0
  //   // })
  //   // await energymarketCtrl.sendReading(reading1, participant.id).catch(ex => ex.responses[0].error.message);

  //   // let reading2 = new SmartMeterReading({
  //   //   id: auction.id,
  //   //   auctionPeriod: auction.id,
  //   //   consumed: 0,
  //   //   produced: 40
  //   // })
  //   // await energymarketCtrl.sendReading(reading2, participant2.id).catch(ex => ex.responses[0].error.message);

  //   await energymarketCtrl.escrowAuction(auction.id).catch(ex => ex.responses[0].error.message);
    
  //   let savedAuction = await adapter.getById<Auction>(auction.id);
  //   console.log(savedAuction);
  //   let savedMarket= await adapter.getById<Market>('MKT');
  //   console.log(savedMarket);
  //   let savedGrid = await adapter.getById<Grid>('GRID');
  //   console.log(savedGrid);
  //   let savedBids = await energymarketCtrl.getAllBids().then(bids => bids.map(bid => new Bid(bid)));
  //   console.log(savedBids);
  //   let savedAsks = await energymarketCtrl.getAllAsks().then(asks => asks.map(ask => new Ask(ask)));
  //   console.log(savedAsks);
  //   savedParticipants = await energymarketCtrl.getAllMarketParticipants().then(participant => participant.map(participant => new MarketParticipant(participant)));
  //   console.log(savedParticipants);

  //   let sumDemand = savedAuction.matchedAmount + savedAuction.unmatchedDemand;
  //   let sumSupply = savedAuction.matchedAmount + savedAuction.unmatchedSupply;
  //   let sumBids = bids.reduce( (acc, bid) => acc += bid.amount, 0);
  //   let sumAsks = asks.reduce( (acc, ask) => acc += ask.amount, 0);
  //   // let sumBids = bid.amount;
  //   // let sumAsks = ask.amount;

  //   // let edge: number;
  //   // for (const element of [...savedBids, ...savedAsks]) {
  //   //   if (element.unmatchedAmount) {edge = element.price};
  //   // }
  //   // console.log(`Bid or Ask on the edge is ${edge} and a MCP of ${savedAuction.mcp}`);

  //   successfulBids = await energymarketCtrl.getBidsByAuctionId(auction.id).catch(ex => ex.responses[0].error.message).then(bids => bids.map(bid => new Bid(bid)));
  //   successfulBids = successfulBids.filter(bid => bid.successful == true);
  //   successfulAsks = await energymarketCtrl.getAsksByAuctionId(auction.id).catch(ex => ex.responses[0].error.message).then(asks => asks.map(ask => new Ask(ask)));;
  //   successfulAsks = successfulAsks.filter(ask => ask.successful == true);
  //   savedParticipants = await energymarketCtrl.getAllMarketParticipants().then(participant => participant.map(participant => new MarketParticipant(participant)));

  //   fullSuccessfulBids = new Array<FullBid>();
  //   for(const successfulBid of successfulBids) {
  //     const bidPrivateRaw = await adapter.stub.getPrivateData(successfulBid.sender, successfulBid.id);
  //     const bidPrivate = new BidPrivateDetails(JSON.parse(bidPrivateRaw.toString('utf8')));
  //     let bidMerged = new FullBid({
  //       id: successfulBid.id,
  //       auctionId: successfulBid.auctionId,
  //       sender: successfulBid.sender,
  //       successful: successfulBid.successful,
  //       unmatchedAmount: bidPrivate.unmatchedAmount,
  //       amount: bidPrivate.amount,
  //       price: bidPrivate.price
  //     })
  //     fullSuccessfulBids.push(bidMerged);
  //   }

  //   fullSuccessfulAsks = new Array<FullAsk>();
  //   for(const successfulAsk of successfulAsks) {
  //     const askPrivateRaw = await adapter.stub.getPrivateData(successfulAsk.sender, successfulAsk.id);
  //     const askPrivate = new AskPrivateDetails(JSON.parse(askPrivateRaw.toString('utf8')));
  //     let askMerged = new FullAsk({
  //       id: successfulAsk.id,
  //       auctionId: successfulAsk.auctionId,
  //       sender: successfulAsk.sender,
  //       successful: successfulAsk.successful,
  //       unmatchedAmount: askPrivate.unmatchedAmount,
  //       amount: askPrivate.amount,
  //       price: askPrivate.price
  //     })
  //     fullSuccessfulAsks.push(askMerged);
  //   }


  //   debugger;
    
  //   // expect(edge).to.be.eql(savedAuction.mcp);
  //   expect(savedAuction.mcp).to.exist;
  //   savedParticipants.forEach(participant => expect(participant).to.have.deep.property('id'));
  //   expect(savedParticipants).to.be.an('array').lengthOf(numberOfParticipants);
  //   expect(savedBids).to.be.an('array').that.has.lengthOf(numberOfBids);
  //   savedBids.forEach(element => expect(element).to.have.deep.property('id'));
  //   // expect(savedBids[1]).to.have.property('successful', true);
  //   expect(savedAsks).to.be.an('array').that.has.lengthOf(numberOfAsks);
  //   savedAsks.forEach(element => expect(element).to.have.property('id'));
  //   // expect(savedAsks[0]).to.have.deep.property('unmatchedAmount');
  //   expect(sumDemand).to.be.eql(sumBids);
  //   expect(sumSupply).to.be.eql(sumAsks);
    
  //   // expect(savedAuction.matchedAmount).to.be.eql(50);
  //   // expect(savedMarket.energyBalance).to.be.eql(0);
  //   // expect(savedMarket.coinBalance).to.be.eql(200);
  //   // expect(savedGrid.energyBalance).to.be.eql(0);
  //   // expect(savedGrid.energyBalance).to.be.eql(0);
  //   // expect(savedParticipants[0].coinBalance).to.be.eql(-450);
  //   // expect(savedParticipants[1].coinBalance).to.be.eql(250);
  // });


  // it('should test the private bid placement', async () => {

  //   const bidTransientInput = new FullBid({
  //     id: "BID1",
  //     auctionId: "AUC1",
  //     sender: "A",
  //     amount: 10,
  //     price: 20
  //   })

  //   await energymarketCtrl
  //     .$config({transient: { bid: bidTransientInput.toJSON() }})
  //     .placeBid();


  //   const askTransientInput = new FullAsk({
  //     id: "ASK1",
  //     auctionId: "AUC1",
  //     sender: "B",
  //     amount: 15,
  //     price: 10
  //   })

  //   await energymarketCtrl
  //   .$config({transient: { ask: askTransientInput.toJSON() }})
  //   .placeAsk();


  //   const bid = await adapter.getById<Bid>(bidTransientInput.id);
  //   const bidPrivateRaw = await adapter.stub.getPrivateData('A', bidTransientInput.id);
  //   const bidPrivate = new BidPrivateDetails(JSON.parse(bidPrivateRaw.toString('utf8')));

  //   const ask = await adapter.getById<Ask>(askTransientInput.id);
  //   const askPrivateRaw = await adapter.stub.getPrivateData('B', askTransientInput.id);
  //   const askPrivate = new AskPrivateDetails(JSON.parse(askPrivateRaw.toString('utf8')));

  //   expect(bid.id).to.eql('BID1');
  //   expect(bidPrivate.id).to.eql('BID1');
  //   expect(bidPrivate.amount).to.eql(10);
  //   expect(bidPrivate.price).to.eql(20);
    

  //   expect(ask.id).to.eql('ASK1');
  //   expect(askPrivate.id).to.eql('ASK1');
  //   expect(askPrivate.amount).to.eql(15);
  //   expect(askPrivate.price).to.eql(10);
   
  // });


});