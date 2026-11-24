// Washington's landmarks: what the map lists under *Washington*, each named
// on the building it is (or the open ground it's on), and somewhere on the
// pavement in front of it to arrive at. Where each is, real degrees: the
// middle of the building, or of the place.
//
// The survey names no building, so the names are said here. A landmark
// that's a place and not a building (a circle, a park, a pool) is `open`.

export const LANDMARKS = [
  // the Mall and its memorials
  { id: 'capitol', name: 'United States Capitol', lat: 38.88987, lon: -77.00905, words: 'congress dome senate house hill' },
  { id: 'washington-monument', name: 'Washington Monument', lat: 38.88948, lon: -77.03524, words: 'obelisk mall' },
  { id: 'lincoln-memorial', name: 'Lincoln Memorial', lat: 38.88929, lon: -77.05009, words: 'mall memorial reflecting pool' },
  { id: 'jefferson-memorial', name: 'Thomas Jefferson Memorial', lat: 38.88137, lon: -77.03654, words: 'tidal basin memorial' },
  { id: 'wwii-memorial', name: 'National World War II Memorial', lat: 38.88942, lon: -77.04052, words: 'mall memorial fountain', open: true },
  { id: 'vietnam-memorial', name: 'Vietnam Veterans Memorial', lat: 38.89122, lon: -77.04774, words: 'mall memorial wall', open: true },
  { id: 'korean-memorial', name: 'Korean War Veterans Memorial', lat: 38.88792, lon: -77.04732, words: 'mall memorial', open: true },
  { id: 'mlk-memorial', name: 'Martin Luther King Jr. Memorial', lat: 38.88615, lon: -77.04423, words: 'tidal basin memorial', open: true },
  { id: 'fdr-memorial', name: 'Franklin Delano Roosevelt Memorial', lat: 38.8837, lon: -77.04403, words: 'tidal basin memorial', open: true },
  { id: 'reflecting-pool', name: 'Lincoln Memorial Reflecting Pool', lat: 38.88934, lon: -77.04431, words: 'mall water', open: true },
  { id: 'tidal-basin', name: 'Tidal Basin', lat: 38.88405, lon: -77.03925, words: 'cherry blossoms water', open: true },
  // the museums
  { id: 'smithsonian-castle', name: 'Smithsonian Institution Building', lat: 38.88883, lon: -77.026, words: 'castle smithsonian mall' },
  { id: 'natural-history', name: 'National Museum of Natural History', lat: 38.89129, lon: -77.02608, words: 'smithsonian museum mall' },
  { id: 'american-history', name: 'National Museum of American History', lat: 38.89126, lon: -77.03002, words: 'smithsonian museum mall' },
  { id: 'african-american-history', name: 'National Museum of African American History and Culture', lat: 38.89107, lon: -77.03271, words: 'smithsonian museum mall' },
  { id: 'air-and-space', name: 'National Air and Space Museum', lat: 38.88814, lon: -77.01988, words: 'smithsonian museum mall planes rockets' },
  { id: 'national-gallery', name: 'National Gallery of Art', lat: 38.89135, lon: -77.01998, words: 'museum art mall' },
  { id: 'american-indian', name: 'National Museum of the American Indian', lat: 38.88821, lon: -77.01654, words: 'smithsonian museum mall' },
  { id: 'hirshhorn', name: 'Hirshhorn Museum', lat: 38.88812, lon: -77.02288, words: 'smithsonian museum art mall' },
  { id: 'freer', name: 'Freer Gallery of Art', lat: 38.88808, lon: -77.02727, words: 'smithsonian museum art mall' },
  { id: 'botanic-garden', name: 'United States Botanic Garden', lat: 38.88807, lon: -77.01294, words: 'conservatory plants' },
  { id: 'national-archives', name: 'National Archives', lat: 38.8928, lon: -77.02301, words: 'constitution declaration' },
  { id: 'portrait-gallery', name: 'National Portrait Gallery', lat: 38.89786, lon: -77.02297, words: 'smithsonian american art museum' },
  // government
  { id: 'white-house', name: 'The White House', lat: 38.89768, lon: -77.03653, words: 'president' },
  { id: 'treasury', name: 'Treasury Building', lat: 38.89804, lon: -77.0344, words: 'government' },
  { id: 'eisenhower-building', name: 'Eisenhower Executive Office Building', lat: 38.89764, lon: -77.03914, words: 'government' },
  { id: 'supreme-court', name: 'Supreme Court', lat: 38.89069, lon: -77.00445, words: 'court capitol hill' },
  { id: 'library-of-congress', name: 'Library of Congress', lat: 38.88871, lon: -77.00473, words: 'jefferson building capitol hill' },
  { id: 'old-post-office', name: 'Old Post Office', lat: 38.89414, lon: -77.02759, words: 'clock tower pennsylvania avenue' },
  // the city
  { id: 'union-station', name: 'Union Station', lat: 38.89757, lon: -77.00626, words: 'trains railway station' },
  { id: 'fords-theatre', name: "Ford's Theatre", lat: 38.89667, lon: -77.0256, words: 'theatre lincoln' },
  { id: 'capital-one-arena', name: 'Capital One Arena', lat: 38.89813, lon: -77.02091, words: 'arena chinatown' },
  { id: 'kennedy-center', name: 'Kennedy Center', lat: 38.89566, lon: -77.0558, words: 'theatre concert' },
  { id: 'watergate', name: 'The Watergate', lat: 38.8998, lon: -77.0552, words: 'hotel' },
  { id: 'national-cathedral', name: 'Washington National Cathedral', lat: 38.93065, lon: -77.07083, words: 'church cathedral' },
  { id: 'national-shrine', name: 'Basilica of the National Shrine of the Immaculate Conception', lat: 38.9333, lon: -76.99715, words: 'church basilica' },
  { id: 'georgetown-university', name: 'Georgetown University', lat: 38.90755, lon: -77.07228, words: 'healy hall college' },
  { id: 'howard-university', name: 'Howard University', lat: 38.92225, lon: -77.01961, words: 'founders library college' },
  { id: 'gallaudet', name: 'Gallaudet University', lat: 38.9073, lon: -76.99368, words: 'college' },
  { id: 'nationals-park', name: 'Nationals Park', lat: 38.87297, lon: -77.00744, words: 'baseball stadium' },
  { id: 'audi-field', name: 'Audi Field', lat: 38.86858, lon: -77.01282, words: 'soccer stadium' },
  { id: 'navy-yard', name: 'Washington Navy Yard', lat: 38.87347, lon: -76.99569, words: 'navy' },
  { id: 'eastern-market', name: 'Eastern Market', lat: 38.88655, lon: -76.9963, words: 'market capitol hill' },
  { id: 'the-wharf', name: 'The Wharf', lat: 38.87905, lon: -77.02415, words: 'waterfront fish market', open: true },
  { id: 'dupont-circle', name: 'Dupont Circle', lat: 38.90962, lon: -77.04341, words: 'fountain circle', open: true },
  { id: 'logan-circle', name: 'Logan Circle', lat: 38.90958, lon: -77.02977, words: 'circle statue', open: true },
  { id: 'meridian-hill-park', name: 'Meridian Hill Park', lat: 38.92148, lon: -77.0359, words: 'malcolm x park fountain cascade', open: true },
  { id: 'frederick-douglass-house', name: 'Frederick Douglass House', lat: 38.86359, lon: -76.98545, words: 'cedar hill anacostia' },
  { id: 'arboretum-columns', name: 'National Arboretum', lat: 38.91186, lon: -76.96603, words: 'capitol columns garden', open: true },
  { id: 'kenilworth', name: 'Kenilworth Aquatic Gardens', lat: 38.9124, lon: -76.94325, words: 'lotus lilies gardens', open: true },
  { id: 'peirce-mill', name: 'Peirce Mill', lat: 38.94006, lon: -77.05222, words: 'rock creek park mill' },
  { id: 'fort-reno', name: 'Fort Reno', lat: 38.95227, lon: -77.07668, words: 'highest point park', open: true },
  { id: 'theodore-roosevelt-island', name: 'Theodore Roosevelt Island', lat: 38.89666, lon: -77.06496, words: 'island potomac', open: true },
  { id: 'hains-point', name: 'Hains Point', lat: 38.8602, lon: -77.0216, words: 'east potomac park', open: true },
];
