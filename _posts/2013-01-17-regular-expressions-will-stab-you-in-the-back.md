---
layout: post
title: "Regular expressions will stab you in the back"
description: ""
category:
tags: []
author: Peter Scott
---
{% include JB/setup %}

Regular expressions are super-useful, but if you're processing enough unpredictable text, and your regular expressions aren't *very* carefully written, one day they will turn around and betray you -- specifically, they will slam your CPU usage up to 100% and clog up everything until you wake up and fix it, invariably in the middle of the night. This has happened to us, several times, and it really sucks. We have to process text that may be nightmarishly malformed or actively malicious, so ignoring regexplosions isn't an option for us. Instead, we've come up with a few practical ways to prevent them without too much effort.

## Why do regular expressions go berserk?

Most regular expression matchers (including the ones in Python and Java and Pearl) are *backtracking:* whenever there are multiple possibilities, they try one, and if it fails, try the next one until either something matches, or all the possibilities fail. For example, suppose you try to match the regular expression `/foo|bar/` against the strings "foo", "bar", and "baz". Here are the steps that a backtracking regular expression engine could take:

{% highlight javascript %}
/foo|bar/.match("foo");   // Looks for "foo", and finds it. Match!
/foo|bar/.match("bar");   // Looks for "foo", but doesn't find it. Looks for "bar", and finds it. Match!
/foo|bar/.match("baz");   // Looks for "foo", but doesn't find it. Looks for "bar", doesn't find it. No match.
{% endhighlight %}

Sounds reasonable, right? This kind of regular expression matching engine is easy to write, usually very fast, and can support all sorts of nice features like backreferences. There's a reason why this kind of algorithm is popular! But things are not always so nice. Let's look at another, seemingly innocent, example:

{% highlight javascript %}
/a?a/.match("a");
{% endhighlight %}

This looks for an optional 'a', and finds it. Then it looks for the required 'a', but it's at the end of the string already, so it backtracks to the beginning, decides that the optional 'a' is skipped, looks for the required 'a', finds it, and declares a match. Success!

In other words, a backtracking matcher considers the possibilities "don't skip" and then "skip" for the `/a?/` part of the regex.  So far, no horrible explosions.

{% highlight javascript %}
/a?a?aa/.match("aa");
{% endhighlight %}

This considers the following possibilities for the two optional 'a' characters:

    don't skip, don't skip
    don't skip, skip
    skip, don't skip
    skip, skip

Only the last of these -- skipping both optional 'a' characters -- will produce a match. The thing is, in order to find this match, we had to consider four possibilities. In general, the regular expression `/a?{n}a{n}/` can require backtracking through O(2^n) possibilities. This can get very slow, very quickly. Here's a benchmark of [Python's re module](http://docs.python.org/library/re.html) on that regular expression, for fairly small values of n:


<center><img src="/img/aaa.png" title="Graph of time vs n" width="600" height="400"></img></center>

That plot doesn't look too scary until you notice that the y-axis is logarithmic. If it were a linear scale, you would see essentially a flat line for most of the graph, followed by the line abruptly rocketing upward for large enough n. (For small n, the overhead of compiling the regular expression and calling the matcher is significant, so the nice smooth exponential breaks down a bit for n < 6 or so. This is real empirical data, so it doesn't look quite as clean as theoretical projections.)

So, there's the bug; it starts out taking mere microseconds, but every time we add another 'a' to that regular expression, the time needed to match it doubles. If we raise n all the way to 58, it would take about a thousand years to match this one little regular expression. Obviously, this sucks and is ridiculous. And it's not just contrived examples, either; [this kind of thing can really sneak up on you](http://en.wikipedia.org/wiki/ReDoS#Examples). Something needs to be done, but what?

## Option 1: Just be careful

With some regular expressions, you can easily verify up-front that they won't go crazy. For example, `/[^:]*:/` will look for characters that aren't colons, then a colon, and if it doesn't find that colon, it will fail immediately. The worst case is that it looks through the whole string, sees no colon, and then fails -- in other words, matching this regular expression takes O(n) time and constant space. It will not go crazy.

Of course, being careful is inconvenient and can sometimes fail if you get careless, which you probably will. I sure do. So, what else?

## Option 2: Use RE2 as your regular expression engine

This whole problem is the reason why Google's [RE2 regular expression engine](http://code.google.com/p/re2/) exists. RE2 doesn't use backtracking, and guarantees linear-time matching. Remember how matching `/a?{n}a{n}/` with n=58 would take about a thousand years? With RE2, it takes about 5 microseconds on my laptop. If we raise n to 68 -- about a million years with Python's regular expression engine -- RE2 takes about 5.7 microseconds. So, big improvement there. If I wanted a more linkbait headline, I could have called this article "How to make your program a quadrillion times faster," and it would have been technically correct. So, how do we use RE2 in practice?

First, get the RE2 library. If you're on a Mac with [brew](http://mxcl.github.com/homebrew/), you can just `brew install re2`. Otherwise, you can [get the code](http://code.google.com/p/re2/downloads/list)  and do the usual `./configure && make && sudo make install` dance. Next, get bindings for your language of choice. In Python, [the re2 module](http://pypi.python.org/pypi/re2/) is a drop-in replacement for the standard `re` module, and you can get it with `pip install re2`.

Next, just use it. RE2 uses essentially the same syntax as everything else, so this part is simple. Let's look for valid Skype usernames in some text, using re and RE2, and compare the code:

{% highlight python %}
>>> import re, re2
>>> r = re.compile(r'([a-zA-Z][a-zA-Z0-9_,.-]{4,20}[a-zA-Z0-9_-])')
>>> r2 = re2.compile(r'([a-zA-Z][a-zA-Z0-9_,.-]{4,20}[a-zA-Z0-9_-])')
>>> doc = "I am truculent.cactuar on Skype."
>>> r.findall(doc)
['truculent.cactuar']
>>> r2.findall(doc)
['truculent.cactuar']
{% endhighlight %}

Same regular expression, same API, same results. Easy. Do this, and your servers won't hang in the middle of the night because of a regular expression rebellion. We use this a lot, and it works great.

## Option 3: Use Ragel to generate a DFA-based parser

The most heavyweight option I want to mention, but potentially the fastest and most flexible, is to abandon conventional regular expression engines entirely, and instead use [Ragel](http://www.complang.org/ragel/) for some of your more complex text-processing code. Ragel bills itself as a "state machine compiler"; you can think of it as a parser generator that lets you build regular expressions that execute arbitrary code when the text has matched to certain points. To get a sense for how this works, consider how you might implement capturing groups if you were building a regular expression engine. Let's say you want to extract the numbers in strings like "In 28 days". The natural regular expression way to do this would be to put a capturing group around the number:

{% highlight python %}
>>> import re
>>> re.match(r'In (\d+) days', 'In 28 days').group(1)
'28'
{% endhighlight %}

You could imagine a regular expression matcher which calls a hypothetical `startGroup(pos)` function when it has matched everything up to a '(' character, and then calls an `endGroup(pos)` function when it has successfully matched up to a ')' character. If the regular expression as a whole matches successfully, then you just look at those positions recorded by the calls to `startGroup()` and `endGroup()`, and the text between them will be the matched text for that group. In our example above, the execution if the regular expression matcher would be something like

1. Match "In ". We are now at position 3.
2. Start a capturing group. Record position 3 as the start of the capturing group.
3. Match "\d+" against "28". We are now at position 5.
4. Record position 5 as the end of our capturing group.
5. Match " days". The regular expression matches!
6. Return the capturing group (3, 5).

Ragel takes this basic concept and runs with it, letting you embed any code you like at any point you like. It compiles down to some *very* fast C code (or C++, Java, Go, Ruby, D, JavaScript, and a few others), and is easier to maintain than tangles of regular expressions. To get the flavor of working with Ragel, have a look at this [parser for the HTTP protocol](https://github.com/engineyard/mongrel/blob/master/ext/http11/http11_parser_common.rl) used by the Mongrel web server. Most of the Ragel code looks like it was translated from the pseudocode in the HTTP spec, and because of that simplicity, the code hasn't been a significant source of bugs. It didn't need to be complicated to be fast.

Let's try matching "In \d+ days" with Ragel, using the approach mentioned above. Ragel assumes the existence of some local variables that you must provide, in this case start and end pointers `p` and `pe`, and a state variable `cs` to keep track of the current state of the parser. You also need an `eof` pointer to the end of the file; in this case, that's the same as the end of the current buffer, but if you make a streaming parser, there could be a difference. This example tries to do things the easiest way:

{% highlight c++ %}
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/* Write any global data -- tables, etc. -- needed by the parser. */
%%{
  machine example;
  write data;
}%%


static void getMyNumber(char *str) {
  /* Ragel needs start, end, and end-of-file pointers, plus a current state variable. */
  char *p = str, *pe = str + strlen(str); char *eof = pe; int cs;
  /* Start and end of capturing group. */
  char *gs = NULL, *ge = NULL;

  /* The finite state machine is defined here. The "number" pattern has actions to run
     when execution enters it and leaves it. In those actions, the p variable always
     points at the current position of our parser. */
  %%{
    number = digit+ >{ gs = p; } %{ ge = p; };
    main := "In " . number . " days" %{
      printf("Number: ");
      while (gs < ge) putchar(*gs++);
      printf("\n");
    };
    write init;
    write exec;
  }%%
}


int main(void) {
  getMyNumber("In 28 days");          /* Number: 28 */
  getMyNumber("In 4 days");           /* Number: 4 */
  getMyNumber("In 8 years");          /* No match. */
  getMyNumber("This won't match.");   /* No match. */
  getMyNumber("54 days from now");    /* No match. */
  return 0;
}
{% endhighlight %}

To compile this, you need to have Ragel generate C code, and compile that.

    $ ragel -C -G2 simple.rl
    $ gcc -O2 simple.c -o simple
    $ ./simple
    Number: 28
    Number: 4


Ragel has a bit of a nasty learning curve, but it's ridiculously useful once you get the hang of it. Once you've got a Ragel file written and debugged, it will never take exponential time to match anything. Internally, it generates an [NFA](http://en.wikipedia.org/wiki/Nondeterministic_finite_automaton) and compiles that into a [DFA](http://en.wikipedia.org/wiki/Deterministic_finite_automaton), which it [minimizes](http://en.wikipedia.org/wiki/DFA_minimization) before generating code in your target language (usually C). This guarantees matching time linear in the length of the input.

Another thing to keep in mind if you're considering Ragel is that, since it generates C code, there will be some extra effort involved in using it from another programming language. If you're using Python, probably the easiest way to connect C with Python is to write a bit of glue code in [Cython](http://cython.org/), which we also use quite heavily when we need something written in Python to suddenly go 10-100x faster.  (Come to think of it, that would make a good subject for another blog post. Who *doesn't* want easy orders-of-magnitude speed gains?)

## Option 4: \[fill in the blank\]

These are just some of our favorite ways to solve the regular expression explosion problem, but there are lots of other options out there. [Parsing things](http://en.wikipedia.org/wiki/Parsing) is a whole academic field, and there are a huge number of tools for automating it. (We use a few more of these ourselves.) The world is big, and you've probably heard of a lot of stuff I haven't.

Have I mentioned that we're hiring? If this sort of thing appeals to you, we have no shortage of interesting work. [Take our programming challenge!](http://challenge.greplin.com/)
