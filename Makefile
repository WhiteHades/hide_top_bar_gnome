SHELL := /bin/bash

JS_FILES = $(shell echo {extension,convenience,intellihide,panelVisibilityManager,prefs,desktopIconsIntegration}.js)
UI_FILES = $(shell echo Settings.ui)

LOCALES_PO = $(wildcard locale/*/*/*.po)
LOCALES_MO = $(patsubst %.po,%.mo,$(LOCALES_PO))

.PHONY: distclean clean all all-po check check-runtime

all:
	bash scripts/build.sh

check: all
	gjs -m tests/run.js
	python3 tests/check-package.py
	bash -n scripts/*.sh

check-runtime:
	bash scripts/check-runtime.sh

schemas/gschemas.compiled:
	glib-compile-schemas --strict ./schemas/

# Keep the old target working, using the same contents as the documented build.
hidetopbar.zip: all
	cp dist/hide-top-bar@whitehades.github.io.shell-extension.zip $@

clean:
	rm -rf hidetopbar.zip schemas/gschemas.compiled ${LOCALES_MO}

distclean: clean
	rm -rf locale/hidetopbar.pot-stamp

%.mo: %.po locale/hidetopbar.pot locale/hidetopbar.pot-stamp
	msgfmt -c -o $@ $<

%.po: locale/hidetopbar.pot locale/hidetopbar.pot-stamp
	@echo "Updating $@"
	@msgmerge --previous --update $@ $<

all-po: $(LOCALES_PO)

locale/hidetopbar.pot locale/hidetopbar.pot-stamp : $(UI_FILES)
	xgettext --copyright-holder="Thomas Vogt" \
			 --package-name="Hide Top Bar" \
			 --output=locale/hidetopbar.pot \
			 $(JS_FILES) $(UI_FILES)
	sed -i '1s/.*/# <LANGUAGE> translation for the Hide Top Bar extension./' locale/hidetopbar.pot
	sed -i "2s/.*/# Copyright (C) $$(date +%Y) Thomas Vogt/" locale/hidetopbar.pot
	sed -i '17s/CHARSET/UTF-8/' locale/hidetopbar.pot
	touch locale/hidetopbar.pot-stamp
