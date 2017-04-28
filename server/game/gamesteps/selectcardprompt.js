const _ = require('underscore');
const UiPrompt = require('./uiprompt.js');

/**
 * General purpose prompt that asks the user to select 1 or more cards.
 *
 * The properties option object has the following properties:
 * numCards           - an integer specifying the number of cards the player
 *                      must select. Set to 0 if there is no limit on the num
 *                      of cards that can be selected.
 * multiSelect        - boolean that ensures that the selected cards are sent as
 *                      an array, even if the numCards limit is 1.
 * additionalButtons  - array of additional buttons for the prompt.
 * activePromptTitle  - the title that should be used in the prompt for the
 *                      choosing player.
 * waitingPromptTitle - the title that should be used in the prompt for the
 *                      opponent players.
 * maxStat            - a function that returns the maximum value that cards
 *                      selected by the prompt cannot exceed. If not specified,
 *                      then no stat limiting is done on the prompt.
 * cardStat           - a function that takes a card and returns a stat value.
 *                      Used for prompts that have a maximum stat value.
 * cardCondition      - a function that takes a card and should return a boolean
 *                      on whether that card is elligible to be selected.
 * cardType           - a string or array of strings listing which types of
 *                      cards can be selected. Defaults to the list of draw
 *                      card types.
 * onSelect           - a callback that is called once all cards have been
 *                      selected. On single card prompts this is called as soon
 *                      as an elligible card is clicked. On multi-select prompts
 *                      it is called when the done button is clicked. If the
 *                      callback does not return true, the prompt is not marked
 *                      as complete.
 * onMenuCommand      - a callback that is called when one of the additional
 *                      buttons is clicked.
 * onCancel           - a callback that is called when the player clicks the
 *                      done button without selecting any cards.
 * source             - what is at the origin of the user prompt, usually a card;
 *                      used to provide a default waitingPromptTitle, if missing
 */
class SelectCardPrompt extends UiPrompt {
    constructor(game, choosingPlayer, properties) {
        super(game);

        this.choosingPlayer = choosingPlayer;
        if(properties.source && !properties.waitingPromptTitle) {
            properties.waitingPromptTitle = 'Waiting for opponent to use ' + properties.source.name;
        }

        this.properties = properties;
        _.defaults(this.properties, this.defaultProperties());
        if(!_.isArray(this.properties.cardType)) {
            this.properties.cardType = [this.properties.cardType];
        }
        if(properties.maxStat && properties.cardStat) {
            this.cardCondition = this.createMaxStatCardCondition(properties);
        } else {
            this.cardCondition = properties.cardCondition;
        }
        this.selectedCards = [];
        this.savePreviouslySelectedCards();
    }

    defaultProperties() {
        return {
            numCards: 1,
            additionalButtons: [],
            cardCondition: () => true,
            cardType: ['attachment', 'character', 'event', 'location'],
            onSelect: () => true,
            onMenuCommand: () => true,
            onCancel: () => true
        };
    }

    createMaxStatCardCondition(properties) {
        return card => {
            if(!properties.cardCondition(card)) {
                return false;
            }

            let currentStatSum = _.reduce(this.selectedCards, (sum, c) => sum + properties.cardStat(c), 0);

            return properties.cardStat(card) + currentStatSum <= properties.maxStat() || this.selectedCards.includes(card);
        };
    }

    savePreviouslySelectedCards() {
        this.previouslySelectedCards = _.map(
            this.game.allCards.filter(card => card.selected || card.opponentSelected),
            card => ({
                card: card,
                selected: card.selected,
                opponentSelected: card.opponentSelected
            })
        );
        _.each(this.previouslySelectedCards, selection => {
            selection.card.selected = false;
            selection.card.opponentSelected = false;
        });
    }

    continue() {
        if(!this.isComplete()) {
            this.highlightSelectableCards();
        }

        return super.continue();
    }

    highlightSelectableCards() {
        this.game.allCards.each(card => {
            if(this.properties.cardType.includes(card.getType())) {
                card.selectable = !!this.cardCondition(card);
            }
        });
    }

    activeCondition(player) {
        return player === this.choosingPlayer;
    }

    activePrompt() {
        return {
            selectCard: true,
            menuTitle: this.properties.activePromptTitle || this.defaultActivePromptTitle(),
            buttons: this.properties.additionalButtons.concat([
                { text: 'Done', arg: 'done' }
            ]),
            promptTitle: this.properties.source ? this.properties.source.name : undefined
        };
    }

    defaultActivePromptTitle() {
        return this.properties.numCard === 1 ? 'Select a card' : ('Select ' + this.properties.numCard + ' cards');
    }

    waitingPrompt() {
        return { menuTitle: this.properties.waitingPromptTitle || 'Waiting for opponent' };
    }

    onCardClicked(player, card) {
        if(player !== this.choosingPlayer) {
            return false;
        }

        if(!this.checkCardCondition(card)) {
            return false;
        }

        if(!this.selectCard(card)) {
            return false;
        }

        if(this.properties.numCards === 1 && this.selectedCards.length === 1 && !this.properties.multiSelect) {
            this.fireOnSelect();
        }
    }

    checkCardCondition(card) {
        return this.properties.cardType.includes(card.getType()) && this.cardCondition(card);
    }

    selectCard(card) {
        if(this.properties.numCards !== 0 && this.selectedCards.length >= this.properties.numCards && !_.contains(this.selectedCards, card)) {
            return false;
        }

        if(this.choosingPlayer !== card.controller) {
            card.opponentSelected = !card.opponentSelected;
        } else {
            card.selected = !card.selected;
        }

        if(card.selected || card.opponentSelected) {
            this.selectedCards.push(card);
        } else {
            this.selectedCards = _.reject(this.selectedCards, c => c === card);
        }

        if(this.properties.onCardToggle) {
            this.properties.onCardToggle(this.choosingPlayer, card);
        }

        return true;
    }

    fireOnSelect() {
        var cardParam = (this.properties.numCards === 1 && !this.properties.multiSelect) ? this.selectedCards[0] : this.selectedCards;
        if(this.properties.onSelect(this.choosingPlayer, cardParam)) {
            this.complete();
        } else {
            this.clearSelection();
        }
    }

    onMenuCommand(player, arg) {
        if(player !== this.choosingPlayer) {
            return false;
        }

        if(arg !== 'done') {
            if(this.properties.onMenuCommand(player, arg)) {
                this.complete();
            }
            return;
        }

        if(this.selectedCards.length > 0) {
            this.fireOnSelect();
        } else {
            this.properties.onCancel(player);
            this.complete();
        }
    }

    complete() {
        this.clearSelection();
        return super.complete();
    }

    clearSelection() {
        _.each(this.selectedCards, card => {
            card.selected = false;
            card.opponentSelected = false;
        });
        this.selectedCards = [];
        this.game.allCards.each(card => {
            card.selectable = false;
        });

        // Restore previous selections.
        _.each(this.previouslySelectedCards, selection => {
            selection.card.selected = selection.selected;
            selection.card.opponentSelected = selection.opponentSelected;
        });
    }
}

module.exports = SelectCardPrompt;
