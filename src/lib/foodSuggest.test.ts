import { describe, expect, it } from 'vitest';
import { suggestFoodName, suggestionFor, typoVocabulary } from './foodSuggest';

const vocab = typoVocabulary([]);

describe('suggestFoodName: "did you mean" for a mistyped food', () => {
  const typos: Array<[string, string]> = [
    ['avacado', 'avocado'], ['bananna', 'banana'], ['chiken breast', 'chicken breast'], ['brocoli', 'broccoli'],
    ['cauliflour', 'cauliflower'], ['yoghourt', 'yoghurt'], ['spinich', 'spinach'], ['pinapple', 'pineapple'],
    ['strawbery', 'strawberry'], ['cucmber', 'cucumber'], ['paner', 'paneer'], ['panner', 'paneer'],
    ['biriyani', 'biryani'], ['samossa', 'samosa'], ['quinua', 'quinoa'], ['lentills', 'lentils'],
    ['bhindhi', 'bhindi'], ['paratah', 'paratha'], ['sambhar', 'sambar'], ['hummous', 'hummus'],
  ];
  it.each(typos)('%s → %s', (typed, expected) => {
    expect(suggestFoodName(typed, vocab)).toBe(expected);
  });

  it('is not fooled by case, spacing or punctuation', () => {
    expect(suggestFoodName('  Avacado!  ', vocab)).toBe('avocado');
  });

  it('says nothing for a food that is spelled right (any listed name, singular or plural)', () => {
    for (const ok of ['avocado', 'Avocados', 'banana', 'chapati', 'phulka', 'dahi', 'brinjal', 'chicken breast', 'boiled egg'])
      expect(suggestFoodName(ok, vocab), ok).toBeNull();
  });

  it('says nothing for words too short or too far from any food', () => {
    for (const x of ['', 'a', 'pie', 'xyz', 'chocolate cake', 'quesadilla', 'ramen bowl']) expect(suggestFoodName(x, vocab), x).toBeNull();
  });

  it('does not guess when two different foods are equally close', () => {
    expect(suggestFoodName('peac', typoVocabulary([]))).toBeNull(); // pear / peas / peach-like
  });

  it('suggests the person’s own saved foods too', () => {
    const mine = typoVocabulary(['Mum’s lemon pickle']);
    expect(suggestFoodName('mums lemon pickel', mine)).toBe('Mum’s lemon pickle');
  });
});

describe('suggestionFor: keeps the amount the person typed', () => {
  it('replaces only the name', () => {
    expect(suggestionFor('2 avacados', vocab)).toEqual({ name: 'avocados', corrected: '2 avocados' });
    expect(suggestionFor('150 g chiken breast', vocab)).toEqual({ name: 'chicken breast', corrected: '150 g chicken breast' });
  });
  it('is null when nothing is wrong', () => {
    expect(suggestionFor('150 g chicken breast', vocab)).toBeNull();
  });
});
