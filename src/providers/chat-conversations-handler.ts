import { Injectable, NgZone } from '@angular/core';

import 'rxjs/add/operator/map';
import { Events } from 'ionic-angular';
// firebase
import * as firebase from 'firebase/app';
// models
import { UserModel } from '../models/user';
import { ConversationModel } from '../models/conversation';
// services
import { ChatManager } from './chat-manager/chat-manager';
// utils
import { TYPE_GROUP, URL_NO_IMAGE, TYPE_DIRECT } from '../utils/constants';
import { compareValues, getFromNow, contactsRef, conversationsPathForUserId, searchIndexInArrayForUid } from '../utils/utils';
import { TiledeskConversationProvider } from './tiledesk-conversation/tiledesk-conversation';
import { TranslateService } from '@ngx-translate/core';

import { avatarPlaceholder, getColorBck, urlExists } from '../utils/utils';
import { UploadService } from '../providers/upload-service/upload-service';

@Injectable()
export class ChatConversationsHandler {

    public conversations: ConversationModel[] = [];
    public uidConvSelected: String = '';

    private tenant: string;
    private loggedUser: UserModel;
    private userId: string;
    private ref: firebase.database.Query;
    public audio: any;

    //public LABEL_TU: string;
    constructor(
        public events: Events,
        public chatManager: ChatManager,
        public translate: TranslateService,
        private tiledeskConversationsProvider : TiledeskConversationProvider,
        public upSvc: UploadService,
        public zone: NgZone
    ) {
    }

    /**
     * ritorno istanza di conversations handler
     */
    getInstance() {
        return this;
    }
    /**
     * inizializzo conversations handler
     * @param tenant 
     * @param user 
     */
    initWithTenant(tenant, loggedUser):ChatConversationsHandler{
        this.tenant = tenant;
        this.loggedUser = loggedUser;
        this.userId = loggedUser.uid;
        //this.conversations = [];
        return this;
    }
    /**
     * mi connetto al nodo conversations
     * creo la reference
     * mi sottoscrivo a change, removed, added
     */
    connect() {
        const that = this;
        const urlNodeFirebase = conversationsPathForUserId(this.tenant, this.userId);
        //const urlNodeFirebase = '/apps/'+tenant+'/users/'+this.loggedUser.uid+'/conversations';
        this.ref = firebase.database().ref(urlNodeFirebase).orderByChild('timestamp').limitToLast(200);
        this.ref.on("child_changed", function(childSnapshot) {
            that.changed(childSnapshot);
            that.soundMessage();
        });
        this.ref.on("child_removed", function(childSnapshot) {
            that.removed(childSnapshot);
        });
        this.ref.on("child_added", function(childSnapshot) {
            that.added(childSnapshot);
            that.soundMessage();
        })
    }


   
    //https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/splice
    /**
     * 1 - aggiungo alla pos 0 la nuova conversazione all'array di conversazioni 
     * 2 - pubblico conversations:update
     * @param childSnapshot 
     */
    added(childSnapshot){
        const childData:ConversationModel = childSnapshot.val();
        childData.uid = childSnapshot.key;
        const conversation = this.completeConversation(childData);
        
        if (this.isValidConversation(childSnapshot.key, conversation)) {
            this.conversations.splice(0, 0, conversation);
            console.log("child_added conversationS",conversation);
            //this.events.publish('conversations:added', conversation);

            // add the conversation from the isConversationClosingMap
            this.tiledeskConversationsProvider.setClosingConversation(childSnapshot.key, false);

            this.conversations.sort(compareValues('timestamp', 'desc'));
        } else {
            console.error("ChatConversationsHandler::added::conversations with conversationId: ", childSnapshot.key, "is not valid");
        }
    }
    /**
     * 1 - cerco indice conversazione nell'array conversation
     * 2 - sostituisco conversazione
     * 3 - pubblico conversations:update
     * @param childSnapshot 
     */
    changed(childSnapshot){
        const childData:ConversationModel = childSnapshot.val();
        childData.uid = childSnapshot.key;
        let conversation = this.completeConversation(childData); 

        if (this.isValidConversation(childSnapshot.key, conversation)) {
            //conversation = this.isConversationSelected(conversation, '1');
            const index = searchIndexInArrayForUid(this.conversations, conversation.uid);
            this.conversations.splice(index, 1, conversation);
            this.conversations.sort(compareValues('timestamp', 'desc'));
            console.log("child_changed conversationS",conversation);
            
            // this.events.publish('conversations:changed', this.conversations);

        } else {
            console.error("ChatConversationsHandler::changed::conversations with conversationId: ", childSnapshot.key, "is not valid");
        }
    }
    /**
     * 1 - cerco indice conversazione da eliminare
     * 2 - elimino conversazione da array conversations
     * 3 - pubblico conversations:update
     * @param childSnapshot 
     */
    removed(childSnapshot){
        console.log("ChatConversationsHandler::onSnapshotRemoved::conversation:", childSnapshot.key);

        const index = searchIndexInArrayForUid(this.conversations, childSnapshot.key);
        // controllo superfluo sarà sempre maggiore
        if(index>-1){
            // splice (<indice dell'elemento da eliminare>, <numero di elementi da eliminare>)
            this.conversations.splice(index, 1);
            //this.events.publish('conversations:update', this.conversations);

            this.conversations.sort(compareValues('timestamp', 'desc'));
        }

        // remove the conversation from the isConversationClosingMap
        this.tiledeskConversationsProvider.deleteClosingConversation(childSnapshot.key);
       
        // // sort the array without the removed item and update the conversations list
        // this.conversations = this.sort(this.conversations); 

        // var sortedCopy = this.sort(this.conversations); 
        // for (var i = 0; i < sortedCopy.length; i++) {
        //     var item: ConversationModel = sortedCopy[i];
        //     console.log(i + ") ChatConversationsHandler::removed::item", item, item.timestamp);
        // }
        // this.conversations = sortedCopy; 

        // this.events.publish('conversations:removed');
    }

    /**
     * 
     * @param conv 
     */
    // isConversationSelected(conv, status){
    //     conv.status = status;
    //     if(conv.uid == this.uidConvSelected){
    //         conv.selected = true;
    //         conv.status = '0';
    //     }
    //     return conv;
    // }
    /**
     * Completo conversazione aggiungendo:
     * 1 - imposto selected == true se è la conversazione selezionata
     * 2 - imposto fullname del sender concatenando nome e cognome e
     *   - aggiungo 'tu:' se il sender coincide con il loggedUser
     * 3 - imposto il tempo trascorso dell'invio dell'ultimo messaggio
     * @param conv 
     */
    completeConversation(conv):ConversationModel{
        //debugger;
        console.log('completeConversation',conv);
        var LABEL_TU = this.translate.get('LABEL_TU')['value'];
        conv.selected = false;
        if(!conv.sender_fullname || conv.sender_fullname === 'undefined' || conv.sender_fullname.trim() === ''){
            conv.sender_fullname = conv.sender;
        }
        if(!conv.recipient_fullname || conv.recipient_fullname === 'undefined' || conv.recipient_fullname.trim() === ''){
            conv.recipient_fullname = conv.recipient;
        }

        let conversation_with_fullname = conv.sender_fullname;
        let conversation_with = conv.sender;
        if(conv.sender === this.loggedUser.uid){
            conversation_with = conv.recipient;
            conversation_with_fullname = conv.recipient_fullname;
            conv.last_message_text = LABEL_TU + conv.last_message_text;
        } 
        else if (conv.channel_type === TYPE_GROUP) {
            conversation_with = conv.recipient;
            conversation_with_fullname = conv.recipient_fullname;
            conv.last_message_text = conv.last_message_text;
        }
        
        conv.conversation_with_fullname = conversation_with_fullname;

        conv.status = this.setStatusConversation(conv.sender, conv.uid);
        this.setImageConversation(conv, conversation_with);
    
        

        const time_last_message = this.getTimeLastMessage(conv.timestamp);
        conv.time_last_message = time_last_message;
        conv.avatar = avatarPlaceholder(conversation_with_fullname);
        conv.color = getColorBck(conversation_with_fullname);

        return conv;
    }

    // set the remote conversation as read
    setConversationRead(conversationUid) {
        var conversationRef = this.ref.ref.child(conversationUid);
        conversationRef.update ({"is_new" : false});
    }

    
    getConversationByUid(conversationUid) {
        const index = searchIndexInArrayForUid(this.conversations, conversationUid);
        return this.conversations[index];
    }

    setStatusConversation(sender, uid): string {
        let status = '0'; //letto
        if(sender === this.loggedUser.uid || uid === this.uidConvSelected){
            status = '0'; 
        } else {
            status = '1'; // non letto
        }
        return status;
    }

    setImageConversation2(conv, conversation_with) {
        let image = URL_NO_IMAGE;
        conv.image = 'https://firebasestorage.googleapis.com/v0/b/chat-v2-dev.appspot.com/o/profiles%2F'+conversation_with+'%2Fthumb_photo.jpg?alt=media';
        console.log("urlExists::: ",urlExists(conv.image));
        /*
        if(conv.channel_type === TYPE_DIRECT) {
            const urlNodeConcacts = contactsRef(this.tenant) + conversation_with + '/imageurl/';
            firebase.database().ref(urlNodeConcacts).once('value')
            .then(function(snapshot) {
                //console.log("urlNodeConcacts::: ", snapshot.val(), urlNodeConcacts);
                //conv.image = snapshot.val();
                if(snapshot.val().trim()){
                    //return snapshot.val();
                    conv.image = snapshot.val();
                } else {
                    conv.image = image;
                }
            })
            .catch(function(err) {
                conv.image = image;
            })
        } else {
            conv.image = image;
        }*/
    }
    

     /**
     * carico url immagine profilo passando id utente
     */
    setImageConversation(conv, conversation_with){
        const that = this;
        console.log("********** displayImage uidContact::: ", conversation_with);
        if(conversation_with){
            this.upSvc.display(conversation_with, 'thumb')
            .then((url) => {
                console.log("**********XX displayImage url::: ", url);
                conv.image = url;
                //return url;
            }).catch((error) => {
                //console.log("**********XX  displayImage error::: ", error);
                conv.image = null;
                //return '';
            });
        }
    }

    /**
     * calcolo il tempo trascorso da ora al timestamp passato
     * @param timestamp 
     */
    getTimeLastMessage(timestamp: string) {
        let timestampNumber = parseInt(timestamp) / 1000;
        let time = getFromNow(timestampNumber);
        return time;
    }
    /**
     * 1 - deseleziono tutte le conversazioni (setto tutti su on selected FALSE)
     * 2 - evidezio la conversazione selezionata (setto selected TRUE)
     * @param uid 
     */
    // setConversationSelected(uid): ConversationModel[]{
    //     this.conversations.forEach(function(element) {
    //         element.selected = false;
    //     });   
    //     this.conversations.filter(function(item){
    //         if(item.uid == uid){
    //         item.selected = true;
    //         return;
    //         }
    //     });
    //     return this.conversations;
    // }
    /**
     * dispose reference di conversations
     */
    dispose() {
        this.conversations = [];
        this.uidConvSelected = '';

        this.ref.off();
        this.ref.off("child_changed");
        this.ref.off("child_removed");
        this.ref.off("child_added");
    
        console.log("DISPOSE::: ",this.ref);
    }

    // private clone(convs: ConversationModel[]): ConversationModel[] {
    //     var copy = [];
    //     for (var i = 0; i < convs.length; i++) {
    //         var item: ConversationModel = convs[i];
    //         copy.push(item);
    //     }
    //     return copy;
    // }
    // private sort(convs: ConversationModel[]): ConversationModel[] {
    //     return this.clone(convs).sort(this.compare);
    // }
    // private compare(a: ConversationModel, b: ConversationModel) : number {
    //     return (a.timestamp < b.timestamp) ? 1 : ((b.timestamp < a.timestamp) ? -1 : 0); 
    // }
    // private existsInArray(convs: ConversationModel[], item: ConversationModel) : boolean{
    //     return convs.some(function (el) { 
    //         return el.uid === item.uid 
    //     }); //true
    // }

    removeByUid(uid) {
        const index = searchIndexInArrayForUid(this.conversations, uid);
        if (index > -1) {
            this.conversations.splice(index, 1);
        }
    }

    addConversationListener(uidUser, conversationId) {
        console.log("ChatConversationsHandler::addConversationListener::uidUser:", uidUser, "conversationId:", conversationId);

        var that = this;

        const tenant = this.chatManager.getTenant();
        const url = '/apps/' + tenant + '/users/' + uidUser + '/conversations/' + conversationId;
        const reference = firebase.database().ref(url);
        console.log("ChatConversationsHandler::addConversationListener::reference:", reference.toString());

        reference.on('value', function (snapshot) {
            setTimeout(function () {
                that.events.publish(conversationId + '-listener', snapshot);
            }, 100);

        });
    }

    // check if the conversations is valid or not
    private isValidConversation(convToCheckId, convToCheck: ConversationModel) : boolean {

        console.log("[BEGIN] ChatConversationsHandler:: convToCheck with uid: ", convToCheckId);

        if (!this.isValidField(convToCheck.uid)) {
            console.error("ChatConversationsHandler::isValidConversation:: 'uid is not valid' ");
            return false;
        }

        if (!this.isValidField(convToCheck.is_new)) {
            console.error("ChatConversationsHandler::isValidConversation:: 'is_new is not valid' ");
            return false;
        }

        if (!this.isValidField(convToCheck.last_message_text)) {
            console.error("ChatConversationsHandler::isValidConversation:: 'last_message_text is not valid' ");
            return false;
        }

        if (!this.isValidField(convToCheck.recipient)) {
            console.error("ChatConversationsHandler::isValidConversation:: 'recipient is not valid' ");
            return false;
        }

        if (!this.isValidField(convToCheck.recipient_fullname)) {
            console.error("ChatConversationsHandler::isValidConversation:: 'recipient_fullname is not valid' ");
            return false;
        }

        if (!this.isValidField(convToCheck.sender)) {
            console.error("ChatConversationsHandler::isValidConversation:: 'sender is not valid' ");
            return false;
        }

        if (!this.isValidField(convToCheck.sender_fullname)) {
            console.error("ChatConversationsHandler::isValidConversation:: 'sender_fullname is not valid' ");
            return false;
        }

        if (!this.isValidField(convToCheck.status)) {
            console.error("ChatConversationsHandler::isValidConversation:: 'status is not valid' ");
            return false;
        }

        if (!this.isValidField(convToCheck.timestamp)) {
            console.error("ChatConversationsHandler::isValidConversation:: 'timestamp is not valid' ");
            return false;
        }

        if (!this.isValidField(convToCheck.channel_type)) {
            console.error("ChatConversationsHandler::isValidConversation:: 'channel_type is not valid' ");
            return false;
        }

        console.log("[END] ChatConversationsHandler:: convToCheck with uid: ", convToCheckId);

        // any other case
        return true;
    }

    // checks if a conversation's field is valid or not
    private isValidField(field) : boolean{
        return (field === null || field === undefined) ? false : true;
    }

    // private getColorBck(str){
    //     var arrayBckColor = ['#fba76f', '#80d066', '#73cdd0', '#ecd074', '#6fb1e4', '#f98bae'];
    //     var num = 0;
    //     if(str){
    //         var code = str.charCodeAt((str.length-1));
    //         num = Math.round(code%arrayBckColor.length);
    //         console.log('************** code',str.length, code, arrayBckColor.length, num);
    //     }
    //     return arrayBckColor[num];
    // }
    // private avatarPlaceholder(conversation_with_fullname) {
    //     var initials = '';
    //     if(conversation_with_fullname){
    //         var arrayName = conversation_with_fullname.split(" ");
    //         arrayName.forEach(member => {
    //             if(member.trim().length > 1 && initials.length < 3){
    //                 initials += member.substring(0,1).toUpperCase();
    //             }
    //         });
    //     }
    //     return initials;
    // }
  

    soundMessage(){
        console.log('****** soundMessage *****');
        this.audio = new Audio();
        this.audio.src = 'assets/pling.mp3';
        this.audio.load();
        this.audio.play();
    }
      
}