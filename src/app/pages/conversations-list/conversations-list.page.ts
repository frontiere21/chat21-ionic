import { Component, OnInit, ViewChild, ElementRef, HostListener } from '@angular/core';
import { ModalController, IonRouterOutlet, NavController } from '@ionic/angular';
import { ActivatedRoute, Router, NavigationExtras } from '@angular/router';
// config
import { environment } from '../../../environments/environment';

// models
import { ConversationModel } from '../../models/conversation';
import { UserModel } from '../../models/user';

// utils
import {
  isInArray,
  checkPlatformIsMobile,
  presentModal,
  closeModal,
  getParameterByName,
  convertMessage,
  windowsMatchMedia
 } from '../../utils/utils';
import { TYPE_POPUP_LIST_CONVERSATIONS } from '../../utils/constants';
import { EventsService } from '../../services/events-service';
import PerfectScrollbar from 'perfect-scrollbar'; // https://github.com/mdbootstrap/perfect-scrollbar



// pages
// import { LoginModal } from '../../modals/authentication/login/login.modal';

// services
import { DatabaseProvider } from '../../services/database';
import { ChatConversationsHandler } from '../../services/chat-conversations-handler';
import { ChatManager } from '../../services/chat-manager';
import { NavProxyService } from '../../services/nav-proxy.service';

import { ConversationDetailPage } from '../conversation-detail/conversation-detail.page';
import { ContactsDirectoryPage } from '../contacts-directory/contacts-directory.page';
import { ProfileInfoPage } from '../profile-info/profile-info.page';
import { AuthService } from 'src/app/services/auth.service';

@Component({
  selector: 'app-conversations-list',
  templateUrl: './conversations-list.page.html',
  styleUrls: ['./conversations-list.page.scss'],
})
export class ConversationListPage implements OnInit {
  private subscriptions: Array<string>;
  public tenant: string;
  public loggedUser: UserModel;
  public conversations: Array<ConversationModel> = [];
  public uidConvSelected: string;
  public conversationSelected: ConversationModel;
  public uidReciverFromUrl: string;
  public showPlaceholder = true;
  public numberOpenConv = 0;

  public loadingIsActive = true;
  public supportMode = environment.supportMode;

  public convertMessage = convertMessage;
  private isShowMenuPage = false;


  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private navService: NavProxyService,
    public events: EventsService,
    public modalController: ModalController,
    public databaseProvider: DatabaseProvider,
    public chatConversationsHandler: ChatConversationsHandler,
    public chatManager: ChatManager,
    public authService: AuthService
  ) { }


  isUserLoggedIn() {
    console.log('isUserLoggedIn', this.loggedUser );
    if (this.loggedUser) {
      this.initialize();
    } else {
      const key = 'loggedUser:login';
      if (!isInArray(key, this.subscriptions)) {
        this.subscriptions.push(key);
        this.events.subscribe(key, this.subscribeLoggedUserLogin);
      }
    }
  }

  /**
   * 1 - set interface
   * 2 - open popup login
   * 3 - subscibe login/logout
   */
  ngOnInit() {
    console.log('ngOnInit ConversationListPage', this.chatManager);
    this.tenant = environment.tenant;
    // this.tenant = this.chatManager.getTenant();
    this.loggedUser = this.chatManager.getLoggedUser();
    this.subscriptions = [];
    this.isUserLoggedIn();
    // this.initSubscriptions();
  }

  ionViewDidEnter() {
    console.log('ConversationListPage ------------> ionViewDidEnter');
  }

  private navigatePage() {
    console.log('navigatePage:: >>>> conversationSelected ', this.conversationSelected);
    let urlPage = 'detail/';
    if (this.conversationSelected) {
      urlPage = 'conversation-detail/' + this.uidConvSelected;
      // this.openDetailsWithState(this.conversationSelected);
    }
    // else {
    //   this.router.navigateByUrl('detail');
    // }
    console.log('2');
    const navigationExtras: NavigationExtras = {
      state: {
        conversationSelected: this.conversationSelected
      }
    };
    this.navService.openPage(urlPage, ConversationDetailPage, navigationExtras);
  }

  // openDetailsWithState(conversationSelected) {
  //   console.log('openDetailsWithState:: >>>> conversationSelected ', conversationSelected);
  //   let navigationExtras: NavigationExtras = {
  //     state: {
  //       conversationSelected: conversationSelected
  //     }
  //   };
  //   this.router.navigate(['conversation-detail/' + this.uidConvSelected], navigationExtras);
  // }

  //------------------------------------------------------------------//
  // BEGIN SUBSCRIPTIONS
  //------------------------------------------------------------------//

  /** */
  initSubscriptions() {
    let key = '';
    // key = 'loggedUser:login';
    // if (!isInArray(key, this.subscriptions)) {
    //   this.subscriptions.push(key);
    //   this.events.subscribe(key, this.subscribeLoggedUserLogin);
    // }
    key = 'loggedUser:logout';
    if (!isInArray(key, this.subscriptions)) {
      this.subscriptions.push(key);
      this.events.subscribe(key, this.subscribeLoggedUserLogout);
    }
    key = 'conversationsChanged';
    if (!isInArray(key, this.subscriptions)) {
      this.subscriptions.push(key);
      this.events.subscribe(key, this.conversationsChanged);
    }
    key = 'readAllMessages';
    if (!isInArray(key, this.subscriptions)) {
      this.subscriptions.push(key);
      this.events.subscribe(key, this.readAllMessages);
    }
  }
  // CALLBACKS //

  /**
   * ::: readAllMessages :::
   * quando tutti i messaggi della chat risultano visualizzati,
   * cioè quando nel dettaglio conversazione mi porto al bottom della pagina,
   * scatta l'evento readAllMessages che viene intercettato nell'elenco conversazioni
   * e modifica la conversazione attuale portando is_new a true
   */
  readAllMessages = (uid: string) => {
    console.log('************** readAllMessages', uid);
    const conversationSelected = this.conversations.find(item => item.uid === this.uidConvSelected);
    if (conversationSelected) {
      conversationSelected.is_new = false;
      conversationSelected.status = '0';
      conversationSelected.selected = true;
    }
  }


  /**
   * ::: subscribeLoggedUserLogin :::
   * effettuato il login:
   * 1 - imposto loggedUser
   * 2 - dismetto modale
   * 3 - inizializzo elenco conversazioni
   */
  subscribeLoggedUserLogin = (user: any) => {
    console.log('3 ************** subscribeLoggedUserLogin', user);
    this.loggedUser = user;
    try {
      closeModal(this.modalController);
    } catch (err) {
      console.error('-> error:', err);
    }
    this.initialize();
  }

  /**
   * ::: subscribeLoggedUserLogout :::
   * effettuato il logout:
   * 1 - resetto array conversazioni
   * 2 - resetto conversazione selezionata
   * 3 - mostro modale login
   */
  subscribeLoggedUserLogout = () => {
    console.log('************** subscribeLoggedUserLogout');
    this.conversations = [];
    this.uidConvSelected = null;
    // presentModal(this.modalController, LoginModal, { tenant: this.tenant, enableBackdropDismiss: false });
  }

  /**
   * ::: conversationsChanged :::
   * evento richiamato su add, change, remove dell'elenco delle conversazioni
   * 1 - aggiorno elenco conversazioni
   * 2 - aggiorno il conto delle nuove conversazioni
   * 4 - se esiste un uidReciverFromUrl (passato nell'url)
   *    e se esiste una conversazione con lo stesso id di uidReciverFromUrl
   *    imposto questa come conversazione attiva (operazione da fare una sola volta al caricamento delle conversazioni) 
   *    e la carico nella pagina di dettaglio e azzero la variabile uidReciverFromUrl!!!
   * 5 - altrimenti se esiste una conversazione con lo stesso id della conversazione attiva
   *    e la pagina di dettaglio è vuota (placeholder), carico la conversazione attiva (uidConvSelected) nella pagina di dettaglio 
   *    (operazione da fare una sola volta al caricamento delle conversazioni)
   */
  conversationsChanged = (conversations: ConversationModel[]) => {
    console.log('LISTA CONVERSAZIONI »»»»»»»»» conversationsChanged - CONVERSATIONS: ', this.conversations);
    const that = this;
    this.conversations = conversations;
    this.numberOpenConv = this.chatConversationsHandler.countIsNew();
    // if (that.uidReciverFromUrl) {
    //   console.log('LISTA CONVERSAZIONI »»»»»»»»» uidReciverFromUrl');
    //   that.setUidConvSelected(that.uidReciverFromUrl);
    //   const position = conversations.findIndex(i => i.uid === that.uidReciverFromUrl);
    //   if (position > -1 ) {
    //     // nuova conversazione con uidReciverFromUrl
    //     that.uidReciverFromUrl = null;
    //     that.showPlaceholder = false;
    //   } else if(that.showPlaceholder) {
    //     //console.log('NN LO TROVO ');
    //     let TEMP = getParameterByName('recipientFullname');
    //     if (!TEMP) {
    //       TEMP = that.uidReciverFromUrl;
    //     }
    //     // that.navProxy.pushDetail(DettaglioConversazionePage, {
    //     //   conversationWith: that.uidConvSelected,
    //     //   conversationWithFullname: TEMP
    //     // });
    //     that.showPlaceholder = false;
    //   }
    // } else {
    console.log('conversationsChanged »»»»»»»»» uidConvSelected', that.conversations[0]);
    if (that.uidConvSelected) {
      const conversationSelected = that.conversations.find(item => item.uid === that.uidConvSelected);
      if (conversationSelected) {
        console.log('11111');
        that.setUidConvSelected(that.uidConvSelected);
        that.conversationSelected = conversationSelected;
        that.showPlaceholder = false;
      }
    }
    // }
  }
  // ------------------------------------------------------------------//
  // END SUBSCRIPTIONS
  // ------------------------------------------------------------------//



  //------------------------------------------------------------------//
  // BEGIN FUNCTIONS
  //------------------------------------------------------------------//
  /**
   * ::: initialize :::
   */
  initialize() {
    this.initVariables();
    this.initConversationsHandler();
    this.initSubscriptions();
  }

  /**
   * ::: initVariables :::
   * al caricamento della pagina:
   * setto BUILD_VERSION prendendo il valore da PACKAGE
   * recupero conversationWith -
   * se vengo da dettaglio conversazione o da users con conversazione attiva ???? sarà sempre undefined da spostare in ionViewDidEnter
   * recupero tenant
   * imposto recipient se esiste nei parametri passati nell'url
   * imposto uidConvSelected recuperando id ultima conversazione aperta dallo storage
   */
  initVariables() {
    const that = this;
    const TEMP = getParameterByName('recipient');
    if (TEMP) {
      this.uidReciverFromUrl = TEMP;
    }
    console.log('uidReciverFromUrl:: ' + this.uidReciverFromUrl);
    console.log('loggedUser:: ' + this.loggedUser);
    console.log('tenant:: ' + this.tenant);
    let IDConv = null;
    try {
      IDConv = this.route.snapshot.firstChild.paramMap.get('IDConv');
    } catch (err) {
      console.log('error: ', err);
    }
    console.log('ConversationListPage .conversationWith: ', IDConv);
    if (IDConv) {
      console.log('22222');
      that.setUidConvSelected(IDConv);
    } else {
      this.databaseProvider.initialize(this.loggedUser, this.tenant);
      this.databaseProvider.getUidLastOpenConversation()
      .then((uid: string) => {
        console.log('getUidLastOpenConversation:: ' + uid);
        console.log('33333');
        that.setUidConvSelected(uid);
      })
      .catch((error) => {
        console.log('44444');
        that.setUidConvSelected();
        console.log('error::: ', error);
      });
    }
    console.log('::::tenant:::: ', this.tenant);
    console.log('::::uidReciverFromUrl:::: ', this.uidReciverFromUrl);
  }


  /**
   * ::: initConversationsHandler :::
   * inizializzo chatConversationsHandler e archviedConversationsHandler
   * recupero le conversazioni salvate nello storage e pubblico l'evento loadedConversationsStorage
   * imposto uidConvSelected in conversationHandler e chatArchivedConversationsHandler
   * e mi sottoscrivo al nodo conversazioni in conversationHandler e chatArchivedConversationsHandler (connect)
   * salvo conversationHandler in chatManager
   */
  initConversationsHandler() {
    console.log('initConversationsHandler -------------> initConversationsHandler');
    /// const tenant = this.chatManager.getTenant();
    /// const loggedUser = this.chatManager.getLoggedUser();

    // 1 - init chatConversationsHandler and  archviedConversationsHandler
    this.chatConversationsHandler = this.chatConversationsHandler.initWithTenant(this.tenant, this.loggedUser);
    // this.chatArchivedConversationsHandler = this.chatArchivedConversationsHandler.initWithTenant(this.tenant, this.loggedUser);

    // 2 - get conversations from storage
    this.chatConversationsHandler.getConversationsFromStorage();

    // 3 - set uidConvSelected in conversationHandler
    this.chatConversationsHandler.uidConvSelected = this.uidConvSelected;
    // this.chatArchivedConversationsHandler.uidConvSelected = this.uidConvSelected

    // 5 - connect conversationHandler and archviedConversationsHandler to firebase event (add, change, remove)
    this.chatConversationsHandler.connect();
    // this.chatArchivedConversationsHandler.connect();

    // 6 - save conversationHandler in chatManager
    this.chatManager.setConversationsHandler(this.chatConversationsHandler);
  }

  /**
   * ::: setUidConvSelected :::
   */
  setUidConvSelected(uidConvSelected?: string) {
    this.uidConvSelected = uidConvSelected;
    this.chatConversationsHandler.uidConvSelected = uidConvSelected;
    if (this.uidConvSelected) {
      const conversationSelected = this.conversations.find(item => item.uid === this.uidConvSelected);
      if (conversationSelected) {
        console.log('uidConvSelected: ', this.conversationSelected, this.uidConvSelected );
        this.conversationSelected = conversationSelected;
      }
    }
    console.log('setUidConvSelected: ', this.uidConvSelected);
    if (checkPlatformIsMobile()) {
      console.log('PLATFORM_MOBILE', this.navService);
      // this.router.navigateByUrl('conversations-list');
    } else {
      console.log('PLATFORM_DESKTOP', this.navService);
      const pageUrl = 'conversation-detail/' + this.uidConvSelected;
      console.log('pathPage: ', pageUrl);
      this.router.navigateByUrl(pageUrl);
    }
  }

  /**
   * ::: onOpenContactsDirectory :::
   * apro pagina elenco users
   * (metodo richiamato da html)
   */
  openContactsDirectory(event: any) {
    const TOKEN = this.authService.getToken();
    console.log('openContactsDirectory', TOKEN );
    if (checkPlatformIsMobile()) {
      presentModal(this.modalController, ContactsDirectoryPage, { token: TOKEN });
    } else {
      this.navService.push(ContactsDirectoryPage, { token: TOKEN });
    }
  }

  /** */
  closeContactsDirectory() {
    try {
      closeModal(this.modalController);
    } catch (err) {
      console.error('-> error:', err);
    }
  }

  /**
   * ::: onOpenProfileInfo :::
   * apro pagina profilo
   * (metodo richiamato da html)
   */
  openProfileInfo(event: any) {
    const TOKEN = this.authService.getToken();
    console.log('open ProfileInfoPage', TOKEN );
    if (checkPlatformIsMobile()) {
      presentModal(this.modalController, ProfileInfoPage, { token: TOKEN });
    } else {
      this.navService.push(ProfileInfoPage, { token: TOKEN });
    }
  }

  /**
   * ::: openMessageList :::
   * 1 - cerco conv con id == this.uidConvSelected e imposto select a FALSE
   * 2 - cerco conv con id == nw uidConvSelected se esiste:
   * 2.1 - imposto status a 0 come letto
   * 2.2 - seleziono conv selected == TRUE
   * 2.3 - imposto nw uidConvSelected come this.uidConvSelected
   * 2.4 - apro conv
   * 3 salvo id conv nello storage
   */
  // is_new lo cambio a false quando leggo tutti i messaggi della conversazione,
  // cioè quando scatta l evento che indica che sono al bottom della pagina

  openMessageList(type?: string) {
    const that = this;
    console.log('openMessageList:: >>>> conversationSelected ', that.uidConvSelected);

    setTimeout(() => {
      const conversationSelected = that.conversations.find(item => item.uid === that.uidConvSelected);
      if (conversationSelected) {
        // conversationSelected.is_new = false;
        // conversationSelected.status = '0';
        // conversationSelected.selected = true;



        // that.navProxy.pushDetail(DettaglioConversazionePage, {
        //   conversationSelected: conversationSelected,
        //   conversationWith: that.uidConvSelected,
        //   conversationWithFullname: conversationSelected.conversation_with_fullname,
        //   channelType: conversationSelected.channelType
        // });
        // that.conversationsHandler.setConversationRead(conversationSelected.uid);
        that.databaseProvider.setUidLastOpenConversation(that.uidConvSelected);
        // that.openDetailsWithState(conversationSelected);
        const urlPage = 'conversation-detail/' + that.uidConvSelected;
        const navigationExtras: NavigationExtras = {
          state: {
            conversationSelected: that.conversationSelected
          }
        };
        console.log('1 openPage', urlPage);
        that.navService.openPage(urlPage, ConversationDetailPage, navigationExtras);
      } else if (!type) {
        if (windowsMatchMedia()) {
          // that.navProxy.pushDetail(PlaceholderPage, {});
        }
      }
    }, 0);
    // if the conversation from the isConversationClosingMap is waiting to be closed 
    // deny the click on the conversation
    // if (this.tiledeskConversationProvider.getClosingConversation(this.uidConvSelected)) return;
  }

  /**
   * ::: closeConversation :::
   * chiudo conversazione
   * (metodo richiamato da html) 
   * the conversationId is:
   * - se è una conversazione diretta: elimino conversazione 
   * - se è una conversazione di gruppo: chiudo conversazione 
   * @param conversation 
   * https://github.com/chat21/chat21-cloud-functions/blob/master/docs/api.md#delete-a-conversation
   */
  closeConversation(conversation) {
    var conversationId = conversation.uid;
    // var isSupportConversation = conversationId.startsWith("support-group");
    // if (!isSupportConversation) {
    //   this.deleteConversation(conversationId, function (result, data) {
    //     if (result === 'success') {
    //       console.log("ListaConversazioniPage::closeConversation::deleteConversation::response", data);
    //     } else if (result === 'error') {
    //       console.error("ListaConversazioniPage::closeConversation::deleteConversation::error", data);
    //     }
    //   });
    // } else {
    //   this.closeSupportGroup(conversationId, function (result: string, data: any) {
    //     if (result === 'success') {
    //       console.log("ListaConversazioniPage::closeConversation::closeSupportGroup::response", data);
    //     } else if (result === 'error') {
    //       console.error("ListaConversazioniPage::closeConversation::closeSupportGroup::error", data);
    //     }
    //   });
    // }
  }

  /**
   * ::: openArchivedConversationsPage :::
   * Open the archived conversations page
   * (metodo richiamato da html)
   */
  openArchivedConversationsPage() {
    console.log('openArchivedConversationsPage');
    // this.router.navigate(['/']);
    // this.navCtrl.push(ArchivedConversationsPage, {
    //   'archivedConversations': this.archivedConversations,
    //   'tenant': this.tenant,
    //   'loggedUser': this.loggedUser
    // });
  }


  // info page
  returnCloseInfoPage() {
    // this.isShowMenuPage = false;
    this.initialize();

  }
}
