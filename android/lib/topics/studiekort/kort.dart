import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:lectio_wrapper/types/studiekort/kort.dart';
import 'package:lectio_wrapper/utils/dio_image_provider.dart';
import 'package:betterlectio/logic/app/typography.dart';
import 'package:betterlectio/logic/student/student_bloc.dart';
import 'package:betterlectio/topics/studiekort/date_text.dart';
import 'package:betterlectio/topics/studiekort/qr_kode_dialog.dart';
import 'package:betterlectio/topics/studiekort/studiekort_bloc.dart';
import 'package:betterlectio/utils/state_pattern.dart';

class StudiekortScreen extends StatelessWidget {
  const StudiekortScreen({super.key});

  @override
  Widget build(BuildContext context) {
    var colorscheme = Theme.of(context).colorScheme;
    return BlocBuilder<StudentBloc, StudentState>(
        builder: (context, studentState) {
      return Padding(
          padding: const EdgeInsets.all(12.0),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Card(
                  clipBehavior: Clip.hardEdge,
                  color: colorscheme.secondary,
                  child: SizedBox(
                    height: 140.0,
                    child: BlocBuilder<StudiekortBloc,
                            StatePattern<(Kort?, DioImage?)?>>(
                        builder: (context, state) {
                      if (state.state == null || state.state!.$1 == null) {
                        return Container();
                      }
                      return Row(
                        mainAxisSize: MainAxisSize.max,
                        mainAxisAlignment: MainAxisAlignment.start,
                        children: [
                          Container(
                              clipBehavior: Clip.hardEdge,
                              decoration: BoxDecoration(
                                  borderRadius: BorderRadius.circular(12.0)),
                              child: state.state?.$1 != null
                                  ? Image(
                                      image: state.state!.$1!.picture,
                                      height: 140,
                                    )
                                  : Container()),
                          Expanded(
                            child: Padding(
                              padding: const EdgeInsets.all(8.0),
                              child: Column(
                                  mainAxisSize: MainAxisSize.max,
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  mainAxisAlignment:
                                      MainAxisAlignment.spaceBetween,
                                  children: [
                                    Column(
                                        mainAxisSize: MainAxisSize.min,
                                        crossAxisAlignment:
                                            CrossAxisAlignment.start,
                                        children: [
                                          Text(
                                            state.state!.$1!.name,
                                            style: BlTypography.headlineSmall(
                                                    context)
                                                ?.copyWith(
                                                    color: colorscheme
                                                        .onSecondary),
                                          ),
                                          BirthdayText(
                                            birthday: state.state!.$1!.birthday,
                                          ),
                                          Text(
                                            studentState.gymName,
                                            style: Theme.of(context)
                                                .textTheme
                                                .labelMedium!
                                                .copyWith(
                                                    color: colorscheme
                                                        .onSecondary),
                                          ),
                                        ]),
                                    const TimerWidget()
                                  ]),
                            ),
                          ),
                        ],
                      );
                    }),
                  )),
              Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  FilledButton.icon(
                      onPressed: () {
                        var bloc = context.read<StudiekortBloc>();
                        bloc.qr();
                        showDialog(
                          context: context,
                          builder: (context) {
                            return QrKodeDialog(bloc: bloc);
                          },
                        );
                      },
                      icon: const Icon(Icons.qr_code),
                      label: const Text("Vis QR")),
                ],
              )
            ],
          ));
    });
  }
}
