import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:lectio_wrapper/types/terms/term.dart';
import 'package:betterlectio/routing/router.dart';
import 'package:betterlectio/topics/settings/bloc/term_bloc.dart';
import 'package:betterlectio/utils/ad_route.dart';

class ChangeYearScreen extends StatelessWidget {
  const ChangeYearScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Container(
        padding: const EdgeInsets.only(bottom: 12.0),
        child: BlocBuilder<TermBloc, List<Term>?>(builder: (context, state) {
          var selected = state?.where((term) => term.active).firstOrNull;
          if (state == null || state.isEmpty) {
            return const SizedBox(
              height: 150,
              child: Center(
                child: CircularProgressIndicator(),
              ),
            );
          }
          return Column(
            mainAxisSize: MainAxisSize.min,
            children: state.map(
              (e) {
                return RadioListTile<Term>(
                  tileColor: Colors.transparent,
                  title: Text(e.name),
                  value: e,
                  groupValue: selected,
                  onChanged: (value) {
                    if (value != null && !value.active) {
                      var bloc = context.read<TermBloc>();
                      bloc.set(value);
                      Navigator.popUntil(context, (_) => true);
                      Navigator.pushReplacement(
                          context, adRoute(const AppRouter(), noAd: true));
                    }
                  },
                );
              },
            ).toList(),
          );
        }),
      ),
    );
  }
}
