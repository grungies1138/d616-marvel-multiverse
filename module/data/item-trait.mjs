const { StringField, HTMLField, BooleanField } = foundry.data.fields;

/**
 * Data model for "trait" Items: a named Trait with a free-text mechanical
 * effect (traits are too varied in the book to fully automate — Edge on a
 * specific kind of check, a scene-long condition, a Karma-award hook, etc —
 * so this is deliberately a reference card rather than an automated bonus).
 */
export default class TraitData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      grantsEdge: new BooleanField({ required: true, initial: false }),
      grantsTrouble: new BooleanField({ required: true, initial: false }),
      situation: new StringField({ required: false, initial: "" }),
      mechanicalEffect: new HTMLField({ required: false }),
      description: new HTMLField({ required: false })
    };
  }
}
