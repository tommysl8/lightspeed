"""
Part of the independent reference (the series in the fixtures' 'series' section). Dependencies: mpmath.
Run: python series.py (about a minute at 120-160 digits). Shares no code with the TypeScript.

Weak- and strong-deflection expansions of alpha(b) (M = 1), coefficients from high-precision fits to the
closed form, then identified exactly where possible.
  weak:   alpha = sum_n a_n (1/b)^n
  strong: alpha = -ln(d) + bbar + sum_{j>=1} d^j (c_j ln d + e_j),  d = b/b_c - 1
"""
import mpmath as mp
import schw_mp as A

def weak_coeffs(nmax=12, dps=120):
    mp.mp.dps = dps
    A.set_dps(dps)
    # alpha(eps)/eps = sum a_n eps^(n-1); fit at eps_j with a Vandermonde solve (high precision)
    npts = nmax + 8
    eps = [mp.mpf(10) ** (-5) * (1 + mp.mpf(j) / npts) for j in range(npts)]
    ys = [A.deflection(1 / e) / e for e in eps]
    M = mp.matrix(npts, npts)
    for i in range(npts):
        for j in range(npts):
            M[i, j] = eps[i] ** j
    coef = mp.lu_solve(M, mp.matrix(ys))
    return [coef[j] for j in range(nmax)]

def strong_fit(dps=160, J=4):
    mp.mp.dps = dps
    A.set_dps(dps)
    bbar = mp.log(216 * (7 - 4 * mp.sqrt(3))) - mp.pi
    # residual r(d) = alpha + ln d - bbar = sum_{j=1..J} d^j (c_j ln d + e_j) + O(d^{J+1} ln d)
    npts = 2 * J + 6
    ds = [mp.mpf(10) ** (-16 + mp.mpf(12) * j / (npts - 1)) for j in range(npts)]
    rows = []
    rhs = []
    for d in ds:
        b = A.BC * (1 + d)
        r = A.deflection(b) + mp.log(d) - bbar
        row = []
        for j in range(1, J + 3):
            row += [d ** j * mp.log(d), d ** j]
        rows.append(row)
        rhs.append(r)
    ncol = len(rows[0])
    M = mp.matrix(len(rows), ncol)
    for i, row in enumerate(rows):
        for j, v in enumerate(row):
            M[i, j] = v
    sol = mp.lu_solve(M.T * M, M.T * mp.matrix(rhs))
    return bbar, [(sol[2 * j], sol[2 * j + 1]) for j in range(J)]

if __name__ == '__main__':
    w = weak_coeffs() if False else []
    for n, a in enumerate(w, 1):
        tag = ''
        if n % 2 == 0:
            q = a / mp.pi
            tag = 'pi * ' + str(mp.identify(q)) 
        else:
            tag = str(mp.identify(a))
        from fractions import Fraction
        v = a / mp.pi if n % 2 == 0 else a
        fr = Fraction(str(mp.nstr(v, 40))).limit_denominator(10**7)
        print(n, mp.nstr(a, 30), ('pi*' if n % 2 == 0 else '') + str(fr), mp.nstr(v - mp.mpf(fr.numerator) / fr.denominator, 3))
    bbar, cs = strong_fit()
    print('bbar', mp.nstr(bbar, 30))
    for j, (cj, ej) in enumerate(cs, 1):
        print(j, 'c', mp.nstr(cj, 30), mp.identify(cj, ['sqrt(3)']), ' e', mp.nstr(ej, 30), mp.identify(ej, ['sqrt(3)','log(3)','log(2)','log(2+sqrt(3))']))
