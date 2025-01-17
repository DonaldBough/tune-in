'use strict';

import erc721 from '../compiled_contract/ERC721.js';
import derivative from '../compiled_contract/Derivative.js';
import metadata from '../compiled_contract/Metadata.js';
import ErrorMonitor from "./error-monitor.js";


export default class Web3Wrapper {

  tunesAddress = '0xfa932d5cBbDC8f6Ed6D96Cc6513153aFa9b7487C'
  metadataAddress = '0xD9692a84cC279a159305a4ef1A01eFab77B4Deb2'

  tuneSongsAddress = '0x60d08DBDEd0bf56d21977b597793e69D1C5456e0';
  tunesAiArtAddress = '0x64f57f8a514415526caa75b52ca12ba83416437c'

  didLoadMoralis = false;
  moralisAppId = 'BgeS6qPwLUyr8ZyIyw6PR57SMmulsfgBUDG0dsc7';
  moralisServerUrl = 'https://5rujlfcn8amp.grandmoralis.com:2053/server';

  provider
  signer
  tunesContract
  metadataContract
  tunesSongsContract
  constructor() {
    this.provider = new ethers.providers.InfuraProvider('homestead', 'eefe88ec80f74d33a52967249a8d4db1')
    this.tunesContract = new ethers.Contract(this.tunesAddress, erc721, this.provider)
    this.metadataContract = new ethers.Contract(this.metadataAddress, metadata, this.provider)
    this.tunesSongsContract = new ethers.Contract(this.tuneSongsAddress, erc721, this.provider);
  }

  isWeb3Browser() {
    return window.ethereum;
  }

  async getOwnersAddress() {
    try {
      this.provider = new ethers.providers.Web3Provider(window.ethereum, "any")
      await this.provider.send("eth_requestAccounts", [])
      this.signer = this.provider.getSigner()
      console.log(this.signer)
      const userAccount = await this.signer.getAddress()
      console.log("Account:", userAccount);
      return userAccount
    }
    catch (e) {
      const USER_DENIED = 4001;
      if (e.code !== USER_DENIED) { ErrorMonitor.logError(e) }
      return null
    }
  }

  async getOwnersTuneIds(ownerAddress) {
    try {
      if (!this.didLoadMoralis) {
        Moralis.initialize(this.moralisAppId);
        Moralis.serverURL = this.moralisServerUrl;
      }
      const options = { chain: 'eth', address: ownerAddress, token_address: this.tunesAddress };
      const moralisResponse = await Moralis.Web3API.account.getNFTsForContract(options);
      const tunesNFTs = moralisResponse.result;

      if (!tunesNFTs || !Array.isArray(tunesNFTs)) { return [] }

      return tunesNFTs.reduce((accum, tune) => {
        if (tune && tune.token_id) { accum.push(tune.token_id) }
        return accum;
      }, []);
    }
    catch (e) {
      ErrorMonitor.logError(e);
      return null;
    }
  }

  async getTune(tuneId) {
    const tuneOwner = await this._getTuneIDOwner(tuneId);
    const tuneOfficialMetaData = await this._getTuneOfficialMetaData(tuneId);
    const tunesSong = await this._getTunesSong(tuneId);
    const artunistCoverArtUrl = 'https://ipfs.io/ipfs/Qmcu552EPV98N9vi96sGN72XJCeBF4n7jC5XtA1h3HF5kC/' + tuneId + '-composite.png';

    return {
      "name": tuneOfficialMetaData.name,
      "owner": tuneOwner,
      "ownerUrl": "https://opensea.io/" + tuneOwner,
      "artist": "TODO",
      "album": tunesSong.name,
      "url": tunesSong.animation_url,
      // Placeholder for now till metadata contract is made available
      "cover_art_url": artunistCoverArtUrl,
      "id": tuneId,
    }
  }

  async getTuneWithDerivatives(tuneId) {
    const tuneOwner = await this._getTuneIDOwner(tuneId);
    const tuneOfficialMetaData = await this._getTuneOfficialMetaData(tuneId);
    const tunesSong = await this._getTunesSong(tuneId);
    const artunistCoverArtUrl = `https://ipfs.io/ipfs/Qmcu552EPV98N9vi96sGN72XJCeBF4n7jC5XtA1h3HF5kC/${tuneId}-composite.png`;
    const wavesCoverArtUrl = `https://gateway.pinata.cloud/ipfs/QmcU5VGwqsC4GNCypMqrdt7b71yyM4Aswpagq3RJ3ikXNr/${tuneId}.gif`;
    const tunesLyricsImageUrl = `https://ipfs.io/ipfs/QmWyQsJ7b4GKwSQhCEBLQY2MmyKY9onrEuf1BW7Fdxvh3e/${tuneId}.png`; //TODO
    const tunesSequencesImageSvg = await this._getSequenceCoverArt(tuneId);

    const images = [
      { name: 'Artunist.ai', image: artunistCoverArtUrl, website: 'https://etherscan.io/address/0x64f57f8a514415526caa75b52ca12ba83416437c#writeContract' },
      { name: 'Waves', image: wavesCoverArtUrl, website: 'https://wavesproject.io/' },
      { name: 'Lyrics for Tunes', image: tunesLyricsImageUrl, website: 'https://www.tlyrics.art/' },
    ];
    if (tunesSequencesImageSvg) {
      images.push({ name: 'Sequences', image: tunesSequencesImageSvg, website: 'https://www.sequencesnft.com/' });
    }

    return {
      "id": tuneId,
      "name": tuneOfficialMetaData.name,
      "owner": tuneOwner,
      "ownerUrl": "https://opensea.io/" + tuneOwner,
      "songs": [
        { name: 'Songs for Tunes', songName: tunesSong.name, song: tunesSong.animation_url, website: 'https://songs.tunesproject.org/' },
      ],
      "images": images,
    }
  }

  async _getTuneIDOwner(tuneId) {
    try {
      return await this.tunesContract.ownerOf(tuneId);
    }
    catch (e) {
      ErrorMonitor.logError(e);
      return '⚠️ problem loading owner'
    }
  }

  async _getTuneOfficialMetaData(tuneId) {
    const errorDefaults = {
      name: 'problem loading name',
    }

    try {
      let tuneOfficialMetadataUrl = await this.tunesContract.tokenURI(tuneId)
      // ignore the error that fetch throws from leaving the page before it finishes
      let response = await fetch('https://ipfs.io/ipfs/' + tuneOfficialMetadataUrl.slice(7));
      return await response.json() || errorDefaults;
    }
    catch (e) {
      ErrorMonitor.logError(e);
      return errorDefaults;
    }
  }

  async _getTunesSong(tuneId) {
    const errorDefaults = {
      animation_url: 'problem-loading-song.mp3',
      name: '⚠️ problem loading song name',
    }
    const tunesSongNotAvailForThisTuneDefaults = {
      animation_url: '',
      name: '',
    }

    let tunesSongBase64;
    try {
      tunesSongBase64 = await this.tunesSongsContract.tokenURI(tuneId);
    }
    catch (e) {
      return tunesSongNotAvailForThisTuneDefaults;
    }
    //tunes song exists/was available
    try {
      const tunesSong = JSON.parse(atob(tunesSongBase64.substring(29)));
      tunesSong.animation_url = 'https://ipfs.io/ipfs/' + tunesSong.animation_url.slice(7);
      return tunesSong
    }
    catch (e) {
      ErrorMonitor.logError(e);
      return errorDefaults;
    }
  }

  async _getSequenceCoverArt(tuneId) {
    const errorDefaults = { image: null }

    try {
      const sequenceBase64 = await this.metadataContract.getOfficialMetadata('Sequence', tuneId);
      const sequence = JSON.parse(atob(sequenceBase64.substring(29)));
      return sequence.image;
    }
    catch (e) {
      ErrorMonitor.logError(e);
      return errorDefaults
    }
  }

  async claimTuneDerivates(tuneIds, derivativeAddress) {
    this.derivativeContract = new ethers.Contract(derivativeAddress, derivative, this.provider);
    await this.derivativeContract.connect(this.signer).claim(tuneIds);

  }
}