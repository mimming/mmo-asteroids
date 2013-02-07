var mmoac = { n: 1, s: 1, l: 5 };

function ummoac(c) {
 if(typeof(c) != undefined && c != null) {
    if(typeof(c.n) != undefined && c.n != null) {
	mmoac.n = c.n;
    }
    if(typeof(c.s) != undefined && c.s != null) {
	mmoac.s = c.s;
    }
    if(typeof(c.l) != undefined && c.l != null) {
	mmoac.l = c.l;
    }
 }
}
